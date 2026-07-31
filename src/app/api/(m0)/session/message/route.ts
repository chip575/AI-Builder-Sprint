// M-SESSION-MSG — POST /api/session/message (FR-101 · FR-110 · FR-115B)
// 응답: SSE. token 이벤트로 본문을 흘리고, 마지막 meta 이벤트 하나로
// SessionMessageRes를 보낸다. 프론트 라우팅 판단은 meta에서만 한다.
import { SessionMessageReq, SessionMessageRes } from "@/lib/contracts";
import { addUtterance, getOrCreateSession } from "@/lib/ai/session/store";
import { createProposal, proposeBranches } from "@/lib/ai/branch/propose";
import { responder } from "@/lib/ai/session/responder";
import { computeCoverage, nextQuestion } from "@/lib/rules/question-bank";
import { MockExtractor } from "@/lib/ai/extract/mock-extractor";
import { detectExpress } from "@/lib/rules/express-detect";
import { track } from "@/lib/observability/track";
import { getCurrentUserId } from "@/lib/auth/session";

const encoder = new TextEncoder();

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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

  // Express 판정은 첫 발화에만 적용된다 (FR-115B "첫 발화가 명시적 의사").
  // 코드 판정이 우선 — UNCERTAIN은 Solar 분류 대상이지만 mock에선 축으로 (결정론).
  const detection = isFirstUtterance
    ? detectExpress(parsed.data.text)
    : ({ kind: "NONE" } as const);
  const branchType = detection.kind === "EXPRESS" ? detection.branchType : null;

  const proposal = branchType
    ? await createProposal({
        sessionId: session.id,
        userId: session.userId,
        branchType,
        origin: "EXPRESS",
        sourceUtteranceId: utterance.id,
      })
    : null;

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

  // 축 세션이면 질문은행이 다음 질문을 고른다 — 가지 세션은 슬롯을 모으지 회상하지 않는다
  const nextAxisQuestion = branchType
    ? null
    : (nextQuestion({
        utterances: allUtterances.map((u) => u.text),
        askedIds: [],
        skippedIds: [],
      })?.text ?? null);

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
