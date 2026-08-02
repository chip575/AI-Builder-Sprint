// M-SESSION-MSG — POST /api/session/message (FR-101 · FR-110 · FR-115B)
// 응답: SSE. token 이벤트로 본문을 흘리고, 마지막 meta 이벤트 하나로
// SessionMessageRes를 보낸다. 프론트 라우팅 판단은 meta에서만 한다.
import { SessionMessageReq, SessionMessageRes } from "@/lib/contracts";
import { addUtterance, getOrCreateSession, saveFacts } from "@/lib/ai/session/store";
import { createProposal, proposeBranches } from "@/lib/ai/branch/propose";
import { detectGuide } from "@/lib/ai/session/guide";
import { handoffReply } from "@/lib/ai/session/handoff";
import { responder } from "@/lib/ai/session/responder";
import { computeCoverage, nextQuestion } from "@/lib/rules/question-bank";
import { MockExtractor } from "@/lib/ai/extract/mock-extractor";
import { detectExpress } from "@/lib/rules/express-detect";
import { isHeavy } from "@/lib/rules/branch-weight";
import { store } from "@/lib/store";
import { track } from "@/lib/observability/track";
import { getCurrentUserId } from "@/lib/auth/session";

const encoder = new TextEncoder();

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * 지금까지 물어본 질문 id — **저장하지 않고 재생해서** 구한다.
 *
 * nextQuestion은 (발화, 물어본 것, 건너뛴 것)의 순수 함수라, 매 턴을 순서대로
 * 다시 돌리면 그때 무엇을 물었는지가 그대로 나온다. 세션 레코드에 열을 추가하거나
 * 마이그레이션을 돌릴 필요가 없고, 질문은행이 요구하는 결정론과도 맞는다.
 */
function askedSoFar(previousTexts: string[]): string[] {
  const asked: string[] = [];
  for (let i = 1; i <= previousTexts.length; i++) {
    const q = nextQuestion({
      utterances: previousTexts.slice(0, i),
      askedIds: asked,
      skippedIds: [],
    });
    if (q) asked.push(q.id);
  }
  return asked;
}

export async function POST(req: Request) {
  const t0 = Date.now(); // NFR-709 관측 지점
  const body = await req.json().catch(() => null);
  const parsed = SessionMessageReq.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "요청 형식이 올바르지 않습니다.",
          nextAction: "입력한 내용을 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }

  // 소유자는 쿠키가 결정한다 — 클라이언트가 userId를 보내지 않는다 (02.4 §0)
  const session = await getOrCreateSession(parsed.data.sessionId, await getCurrentUserId(req));
  const isFirstUtterance = session.utterances.length === 0;
  const utterance = await addUtterance(session.id, parsed.data.text);

  // 안내 층 — 질문형 발화는 LLM 없이 코드가 답한다 (P3 · lib/ai/session/guide.ts)
  const guide = detectGuide(parsed.data.text);

  // Express 판정은 첫 발화에만 적용된다 (FR-115B "첫 발화가 명시적 의사").
  // 코드 판정이 우선 — UNCERTAIN은 Solar 분류 대상이지만 mock에선 축으로 (결정론).
  // ⚠ 질문형이면 직행하지 않는다 — "유산 기부는 어떻게 하나요?"는 의사가 아니라 질문이다.
  //   안내가 답하고, 의사는 감지(FR-115A)가 확인형 제안으로 묻는다. 직행은 명시적 의사만.
  const detection = isFirstUtterance && !guide
    ? detectExpress(parsed.data.text)
    : ({ kind: "NONE" } as const);
  // 가지는 턴을 넘어도 유지된다 — 열린(OPENED) 가지가 있으면 그 대화는 가지 대화다.
  // 이게 없으면 둘째 턴부터 branchType=null이 되어 응답기가 회상 질문으로 새고,
  // 슬롯을 묻던 대화가 갑자기 다른 주제를 꺼낸다 (작성실 흐름에서 드러남).
  const openBranch =
    [...session.proposals].reverse().find((p) => p.status === "OPENED")?.branchType ?? null;

  // 이번 발화가 새로 연 가지 — 이미 열린 가지를 이어가는 턴에는 null이다.
  // (여기서 openBranch까지 묶으면 턴마다 제안 행이 하나씩 쌓인다)
  const expressType = detection.kind === "EXPRESS" ? detection.branchType : null;

  const proposal = expressType
    ? await createProposal({
        sessionId: session.id,
        userId: session.userId,
        branchType: expressType,
        origin: "EXPRESS",
        sourceUtteranceId: utterance.id,
      })
    : null;

  // **직행은 그 자체가 여는 행위다 — 상태를 남겨야 다음 턴이 이 대화를 알아본다.**
  // 남기지 않으면 제안이 PROPOSED로 머물고 openBranch가 영원히 null이라,
  // 금액을 물어놓고 답하면 회상 질문으로 새어 나간다 (실측 2026-08-02).
  // 무거운 가지는 열지 않는다 — 숙려 화면을 거친다 (FR-115B).
  if (proposal) {
    await store.decideProposal(
      proposal.id,
      isHeavy(proposal.branchType) ? "PENDING_RECONFIRM" : "OPENED",
    );
  }

  const branchType = expressType ?? openBranch;

  // ── 응답기에 넘길 세션 지식 ──
  // 방금 발화까지 포함해 **결정론적으로** 슬롯을 훑는다. LLM 호출이 아니라
  // 추출기의 규칙 판정이라 비용도 지연도 없다. 이걸 안 넘기면 응답기는
  // 사용자가 방금 말한 것을 다시 묻는다 (실제로 그렇게 나왔다).
  const allUtterances = [...session.utterances, utterance];
  const scan = await new MockExtractor().extract({
    intentId: session.id,
    branchType,
    utterances: allUtterances,
  });
  const knownFacts = scan.facts.map((f) => ({ key: f.key, value: f.value as string | number }));

  // 훑은 값은 **바로 저장한다** — 응답기는 되읽는데 화면(약정서 미리보기)은 비어 있던
  // 어긋남의 원인이 여기였다: 값이 추출(POST /extract) 전까지 어디에도 안 남았다.
  // saveFacts는 확정된 값을 덮지 않고(P1, StorePort 보장), 이후 정식 추출이 같은 키를
  // 갱신하므로 품질도 수렴한다. 계약 밖 채널이 아니라 기존 facts 저장소를 쓴다 (규칙 1).
  if (scan.facts.length > 0) {
    await saveFacts(session.id, scan.facts).catch((err) =>
      // 미리보기 편의가 대화를 죽이면 안 된다 — 실패는 기록만 남긴다
      console.warn("[session] 훑은 값 저장 실패:", (err as Error).message),
    );
  }

  // 축 세션이면 질문은행이 다음 질문을 고른다 — 가지 세션은 슬롯을 모으지 회상하지 않는다
  const nextAxisQuestion = branchType
    ? null
    : (nextQuestion({
        utterances: allUtterances.map((u) => u.text),
        // **이미 물어본 질문을 넘겨야 다음 질문으로 넘어간다.** 빈 배열을 넘기면
        // 축 순위가 그대로인 한 같은 질문이 영원히 나온다 — 실제로 사용자가
        // 무슨 말을 해도 같은 문장이 반복됐다 (2026-08-01).
        askedIds: askedSoFar(session.utterances.map((u) => u.text)),
        skippedIds: [],
      })?.text ?? null);

  // 다음 행동이 화면(버튼·확인)에 있으면 LLM을 부르지 않는다 (handoff.ts의 도돌이표 해부).
  // 최신 제안이 재확인 대기(PENDING_RECONFIRM)면 결정은 decide 버튼만 받는다.
  const latestProposal = session.proposals.at(-1);
  const handoff = guide
    ? null
    : handoffReply({
        branchType,
        missingRequired: scan.missingRequired,
        knownFacts,
        pendingReconfirm:
          latestProposal?.status === "PENDING_RECONFIRM"
            ? latestProposal.origin === "EXPRESS"
              ? "EXPRESS"
              : "DETECTED"
            : null,
      });

  // 대화 중 감지 (FR-115A) — Express로 이미 갈라졌으면 감지하지 않는다.
  // 응답 스트림보다 **먼저 띄우고 나중에 거둔다**: 감지를 기다렸다가 응답을 시작하면
  // NFR-702의 기준(첫 토큰 2초)이 모델 두 번 호출 시간이 된다.
  const detecting = proposal
    ? Promise.resolve([])
    : proposeBranches({
        sessionId: session.id,
        userId: session.userId,
        utterances: allUtterances,
      }).catch((err) => {
        // 감지 실패가 대화를 죽이지 않는다. 제안 0건은 결함이 아니다
        console.warn("[branch] 감지 실패:", (err as Error).message);
        return [];
      });

  const meta = SessionMessageRes.parse({
    sessionId: session.id,
    utteranceId: utterance.id,
    // 방금 발화까지 포함해 센다 — 화면이 답을 보내자마자 진도가 움직여야 한다.
    // 삭제된 발화는 세지 않는다 (store가 이미 제외한 목록을 준다)
    axisCoverage: computeCoverage([
      ...session.utterances.map((u) => u.text),
      parsed.data.text,
    ]),
    expressBranch: proposal
      ? { branchType: proposal.branchType, proposalId: proposal.id }
      : null,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let firstTokenSent = false;
      if (guide || handoff) {
        // 결정론적 응답 — 첫 토큰이 곧 전체다. 응답기(LLM)는 이 턴을 건너뛴다.
        // 감지(proposal)와 meta는 그대로 흘린다: 안내를 받았어도 발화에 의사가
        // 실려 있으면 확인형 제안이 뒤따라야 한다 (FR-115A)
        controller.enqueue(sse("token", guide?.reply ?? handoff!));
        firstTokenSent = true;
        track("CONVERSE", true, Date.now() - t0);
      } else {
        try {
          for await (const chunk of responder.respond({
            utterances: allUtterances,
            branchType,
            knownFacts,
            missingRequired: scan.missingRequired,
            nextAxisQuestion,
          })) {
            controller.enqueue(sse("token", chunk));
            if (!firstTokenSent) {
              firstTokenSent = true;
              // NFR-702의 기준은 **첫 토큰 2초**다 — 전체 스트림 시간이 아니라
              // 이 값을 재야 지표가 곧 준수의 증거가 된다
              track("CONVERSE", true, Date.now() - t0);
            }
          }
        } catch (err) {
          // 스트림 도중 실패 — 사용자에게 보일 문구로 번역해 마지막에 싣는다 (NFR-705)
          console.warn("[session] 응답 생성 실패:", (err as Error).message);
          if (!firstTokenSent) {
            track("CONVERSE", false, Date.now() - t0);
            controller.enqueue(sse("token", "잠시 문제가 있었어요. 다시 말씀해 주시겠어요?"));
          }
        }
      }
      // 감지된 제안 — 확인형 문구 그대로 화면에 오른다. 여는 것은 사용자다 (FR-115A).
      // 응답 뒤에 놓는 이유: 제안이 답보다 먼저 뜨면 그건 대화가 아니라 영업이다
      for (const proposed of await detecting) {
        controller.enqueue(sse("proposal", proposed));
      }
      controller.enqueue(sse("meta", meta)); // 항상 마지막 이벤트
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
