// M-SESSION-MSG — POST /api/session/message (FR-101 · FR-110 · FR-115B)
// 응답: SSE. token 이벤트로 본문을 흘리고, 마지막 meta 이벤트 하나로
// SessionMessageRes를 보낸다. 프론트 라우팅 판단은 meta에서만 한다.
import { SessionMessageReq, SessionMessageRes } from "@/lib/contracts";
import { addUtterance, getOrCreateSession, saveFacts } from "@/lib/ai/session/store";
import { createProposal, proposeBranches } from "@/lib/ai/branch/propose";
import { detectGuide, isQuestionShaped } from "@/lib/ai/session/guide";
import { CORRECT_REPLY, STOP_REPLY, detectCorrection } from "@/lib/ai/session/correction";
import { handoffReply } from "@/lib/ai/session/handoff";
import { assetReadback } from "@/lib/ai/prompts/asset-readback";
import { summarize } from "@/app/api/(m4)/estate/inventory";
import { responder } from "@/lib/ai/session/responder";
import { computeCoverage, nextQuestion } from "@/lib/rules/question-bank";
import { MockExtractor } from "@/lib/ai/extract/mock-extractor";
import { detectExpress } from "@/lib/rules/express-detect";
import { branchForDoc } from "@/lib/ai/branch/doc-branch";
import { isHeavy } from "@/lib/rules/branch-weight";
import { store } from "@/lib/store";
import { track } from "@/lib/observability/track";
import { getCurrentUserId, loginRequired } from "@/lib/auth/session";

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
  // 로그인하지 않았으면 발화를 저장하지 않는다 — 익명 신원이 없으므로 소유자를 정할 수 없다
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();
  // 재산은 **매 턴 읽는다.** 발화를 정규식으로 걸러 조회할지 정하면, 재산어가 없는 말
  // ("이거 애들한테 어떻게 하면 좋을까요")을 놓치고 그때 모델은 아무것도 모르는 채로 답한다.
  // 여기서 먼저 띄우고 응답기에 넘기기 직전에 거둔다 — 첫 토큰 2초(NFR-702)에 왕복을 더하지 않게.
  // 대화는 재산을 **읽기만 한다.** 등록은 화면(POST /estate/assets)이 받는다: 회상 인터뷰는
  // 이야기를 끌어내려고 넓게 묻는데 자산 목록은 정확해야 해서, 한 통로로 합치면
  // "아버지가 땅을 좀 주셨는데"가 부동산 1건이 된다.
  const assetsPending = store
    .listAssets(userId)
    .then(summarize)
    .catch((err) => {
      // 조회 실패를 "자산 없음"으로 바꾸지 않는다 — 없다고 말하면 거짓이 된다 (보안 7조)
      console.warn("[session] 자산 조회 실패:", (err as Error).message);
      return null;
    });

  const session = await getOrCreateSession(parsed.data.sessionId, userId);
  const isFirstUtterance = session.utterances.length === 0;
  const utterance = await addUtterance(session.id, parsed.data.text);

  // 안내 층 — 질문형 발화는 LLM 없이 코드가 답한다 (P3 · lib/ai/session/guide.ts)
  const guide = detectGuide(parsed.data.text, parsed.data.docType);

  // 안내 커버리지 — **무엇을 카드로 만들지 짐작으로 정하지 않기 위한 계측.**
  //
  // 미스 전부를 세지 않는다. "고향에 기부하고 싶어요"는 미스지만 결함이 아니라
  // 가지 대화다. 셀 값은 **질문 모양인데 주제를 모르는 것** 하나다 — 그게 우리가
  // 답해야 하는데 못 답하는 목록이다.
  //
  // ⚠ 발화 원문을 남기지 않는다 (보안 1조). 무엇을 물었는지는 이미 세션 발화로
  //   저장되어 있고 RLS가 지킨다 — 여기서 로그로 한 번 더 흘리면 그 보호를 우회한다.
  if (!guide && isQuestionShaped(parsed.data.text)) {
    console.info("[guide] MISS — 질문형인데 주제 없음");
  } else if (guide) {
    console.info(`[guide] HIT topic=${guide.topic}`);
  }

  // 흐름을 멈추거나 되돌리려는 말인가 — **잘못 들어간 대화에서 나오는 길** (correction.ts).
  // 안내(guide)가 답할 발화라면 보지 않는다: 안내는 이미 사용자가 물은 것에 답한다.
  const correction = guide ? ({ kind: "NONE" } as const) : detectCorrection(parsed.data.text);

  // Express 판정은 첫 발화에만 적용된다 (FR-115B "첫 발화가 명시적 의사").
  // 코드 판정이 우선 — UNCERTAIN은 Solar 분류 대상이지만 mock에선 축으로 (결정론).
  // ⚠ 질문형이면 직행하지 않는다 — "유산 기부는 어떻게 하나요?"는 의사가 아니라 질문이다.
  //   안내가 답하고, 의사는 감지(FR-115A)가 확인형 제안으로 묻는다. 직행은 명시적 의사만.
  // **작성실이면 가지를 고르지 않는다.** 서류가 이미 정해진 대화에서 "혹시 다른 걸
  // 하시겠어요?"를 묻는 것은 도움이 아니라 방해다 — 기부 약정서를 쓰는 중에 세금을
  // 물었더니 "고향에 기부하고 싶으신가요?"가 떴다 (2026-08-03 실사용).
  // 그 화면의 챗봇은 **그 서류를 채우는 도우미**이지 가지를 고르는 안내원이 아니다.
  const inWorkroom = parsed.data.docType != null;

  const detection = isFirstUtterance && !guide && !inWorkroom
    ? detectExpress(parsed.data.text)
    : ({ kind: "NONE" } as const);
  // 가지는 턴을 넘어도 유지된다 — 열린(OPENED) 가지가 있으면 그 대화는 가지 대화다.
  // 이게 없으면 둘째 턴부터 branchType=null이 되어 응답기가 회상 질문으로 새고,
  // 슬롯을 묻던 대화가 갑자기 다른 주제를 꺼낸다 (작성실 흐름에서 드러남).
  const openBranch =
    [...session.proposals].reverse().find((p) => p.status === "OPENED")?.branchType ?? null;

  // 이번 발화가 새로 연 가지 — 이미 열린 가지를 이어가는 턴에는 null이다.
  // (여기서 openBranch까지 묶으면 턴마다 제안 행이 하나씩 쌓인다)
  //
  // 작성실의 첫 발화는 **문장이 아니라 고른 서류**가 가지를 정한다. 이 줄이 없으면
  // 무거운 가지(유산 기부)의 숙려 제안이 만들어지지 않아 "오늘 할지, 다음에 할지"를
  // 묻는 화면이 통째로 사라진다 (FR-115B).
  const expressType =
    detection.kind === "EXPRESS"
      ? detection.branchType
      : inWorkroom && isFirstUtterance
        ? branchForDoc(parsed.data.docType)
        : null;

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

  // **작성실은 화면이 고른 서류가 곧 가지다.** 첫 발화를 규칙으로 되짚어 알아맞히지
  // 않는다 — 조사 하나("유산을 기부")에 미끄러져 엉뚱한 가지가 열리던 자리다.
  // 이게 없으면 작성실 대화가 축(회상)으로 취급되어 "가장 잘했다고 생각하는 결정은
  // 무엇인가요?"가 약정서 작성 중에 나온다 (2026-08-03 실사용).
  // **그만두겠다고 하면 실제로 닫는다.** 말로만 받고 상태를 두면 다음 턴이
  // 다시 슬롯을 묻는다 — 사용자가 두 번 그만두게 만드는 것은 예의가 아니다 (P4).
  if (correction.kind === "STOP") {
    for (const p of session.proposals) {
      if (p.status === "OPENED" || p.status === "PENDING_RECONFIRM") {
        await store.decideProposal(p.id, "DEFERRED").catch((err) =>
          // 닫기 실패가 "멈췄다"는 답을 막지는 않는다 — 기록만 남긴다
          console.warn("[branch] 가지 닫기 실패:", (err as Error).message),
        );
      }
    }
  }

  const branchType =
    correction.kind === "STOP"
      ? null
      : (expressType ?? openBranch ?? branchForDoc(parsed.data.docType));

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
  // ⚠ **이번 턴에 만든 제안은 제외한다** — 첫 직행 턴은 고지·인사(응답기)가 답해야 한다.
  //   인메모리 스토어는 세션 객체를 참조로 공유해 방금 만든 제안이 session.proposals에
  //   이미 들어 있다 (Supabase 스냅샷과 달리). 제외하지 않으면 스토어에 따라 첫 턴
  //   응답이 갈라진다 (route.test가 잡았다, 2026-08-02).
  const latestProposal = session.proposals
    .filter((p) => p.id !== proposal?.id)
    .at(-1);
  // 정정·중단 턴에는 handoff(슬롯 질문)를 하지 않는다. 사용자가 "아니"라고 한 직후에
  // 준비된 질문을 던지는 것이 바로 그 자동응답기 느낌의 정체다
  const handoff = guide || correction.kind !== "NONE"
    ? null
    : handoffReply({
        branchType,
        missingRequired: scan.missingRequired,
        knownFacts,
        // ⚠ 숙려 대기 중이어도 **묻는 말에는 답한다.** 예전에는 무슨 말을 해도
        //   "버튼으로 남겨 주셔야 진행됩니다"만 돌아왔다 — "서명하고 나면 못 바꾸나요?"
        //   같은 질문까지 막혀서, 결정을 도우려는 화면이 결정에 필요한 정보를 막았다.
        //   버튼은 화면에 그대로 있으므로 진행 경로가 사라지지 않는다 (2026-08-03).
        pendingReconfirm:
          latestProposal?.status === "PENDING_RECONFIRM" && !isQuestionShaped(parsed.data.text)
            ? latestProposal.origin === "EXPRESS"
              ? "EXPRESS"
              : "DETECTED"
            : null,
      });

  // 대화 중 감지 (FR-115A) — Express로 이미 갈라졌으면 감지하지 않는다.
  // 응답 스트림보다 **먼저 띄우고 나중에 거둔다**: 감지를 기다렸다가 응답을 시작하면
  // NFR-702의 기준(첫 토큰 2초)이 모델 두 번 호출 시간이 된다.
  // ⚠ 열린 가지가 있거나 작성실이면 감지하지 않는다. 예전에는 **매 턴 돌았고**,
  //   그래서 이미 목적지가 정해진 대화에 다른 가지 제안이 계속 끼어들었다.
  //   감지는 "아직 어디로 갈지 모르는 대화"에서만 쓸모가 있다 (FR-115A).
  const detecting = proposal || openBranch || inWorkroom
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
      if (correction.kind !== "NONE") {
        // 멈춤·정정은 코드가 답한다. 모델을 부르면 붙잡거나(중단), 지시를 무시하고
        // 하던 질문을 이어간다(정정) — 둘 다 실측으로 확인됐다 (2026-08-03)
        controller.enqueue(sse("token", correction.kind === "STOP" ? STOP_REPLY : CORRECT_REPLY));
        firstTokenSent = true;
        track("CONVERSE", true, Date.now() - t0);
      } else if (guide || handoff) {
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
            assetLine: assetReadback(await assetsPending),
            // 작성실이면 **그 서류의 주의사항**이 프롬프트에 실린다 (system-prompt DOC_NOTE).
            // 가지에서 유도하지 않고 화면이 말해 주는 값을 그대로 쓴다
            docType: parsed.data.docType ?? undefined,
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
