// M-SESSION-MSG — POST /api/session/message (FR-101 · FR-110 · FR-115B)
// 응답: SSE. token 이벤트로 본문을 흘리고, 마지막 meta 이벤트 하나로
// SessionMessageRes를 보낸다. 프론트 라우팅 판단은 meta에서만 한다.
import { SessionMessageReq, SessionMessageRes } from "@/lib/contracts";
import {
  addProposal,
  addUtterance,
  getOrCreateSession,
} from "@/lib/ai/session/store";
import { mockReply, tokenize } from "@/lib/ai/session/mock-responder";
import { detectExpress } from "@/lib/rules/express-detect";
import { track } from "@/lib/observability/track";

const encoder = new TextEncoder();

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: Request) {
  const t0 = Date.now(); // NFR-709 관측 지점
  if ((process.env.UPSTAGE_MODE ?? "mock") !== "mock") {
    // Solar 연동은 키 확보 후 이 분기에 붙는다. 조용한 mock 폴백 금지 (보안 7조).
    return Response.json(
      {
        ok: false,
        error: {
          code: "UPSTAGE_NOT_CONFIGURED",
          message: "실 모델 연동이 아직 준비되지 않았습니다.",
          nextAction: "UPSTAGE_MODE=mock으로 전환하거나 관리자에게 문의하세요.",
        },
      },
      { status: 503 },
    );
  }

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

  const session = getOrCreateSession(parsed.data.sessionId);
  const isFirstUtterance = session.utterances.length === 0;
  const utterance = addUtterance(session, parsed.data.text);

  // Express 판정은 첫 발화에만 적용된다 (FR-115B "첫 발화가 명시적 의사").
  // 코드 판정이 우선 — UNCERTAIN은 Solar 분류 대상이지만 mock에선 축으로 (결정론).
  const detection = isFirstUtterance
    ? detectExpress(parsed.data.text)
    : ({ kind: "NONE" } as const);
  const branchType = detection.kind === "EXPRESS" ? detection.branchType : null;

  const proposal = branchType
    ? addProposal(session, branchType, "EXPRESS", utterance.id)
    : null;

  const meta = SessionMessageRes.parse({
    sessionId: session.id,
    utteranceId: utterance.id,
    axisCoverage: [], // 질문은행 커버리지는 M-QUESTION-BANK(M2)에서 채워진다
    expressBranch: proposal
      ? { branchType: proposal.branchType, proposalId: proposal.id }
      : null,
  });

  const tokens = tokenize(mockReply(branchType));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const t of tokens) controller.enqueue(sse("token", t));
      controller.enqueue(sse("meta", meta)); // 항상 마지막 이벤트
      controller.close();
      track("CONVERSE", true, Date.now() - t0);
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
