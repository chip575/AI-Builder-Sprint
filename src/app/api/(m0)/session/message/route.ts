// M-SESSION-MSG — POST /api/session/message (FR-101 · FR-110 · FR-115B)
// 응답: SSE. token 이벤트로 본문을 흘리고, 마지막 meta 이벤트 하나로
// SessionMessageRes를 보낸다. 프론트 라우팅 판단은 meta에서만 한다.
import { SessionMessageReq, SessionMessageRes } from "@/lib/contracts";
import {
  addProposal,
  addUtterance,
  getOrCreateSession,
} from "@/lib/ai/session/store";
import { responder } from "@/lib/ai/session/responder";
import { computeCoverage } from "@/lib/rules/question-bank";
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
    ? await addProposal(session.id, branchType, "EXPRESS", utterance.id)
    : null;

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
          utterances: session.utterances,
          branchType,
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
