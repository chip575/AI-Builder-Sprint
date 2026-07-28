// M-MOCK — POST /api/dev/webhook-sim (NFR-707)
// mock signer에 외부 이벤트를 주입해 실제 상태 머신을 통과시킨다.
// M-WEBHOOK 구현 후에는 반환된 페이로드를 /api/webhooks/modusign으로 그대로 전달한다.
import { NextResponse } from "next/server";
import { WebhookSimReq } from "@/lib/contracts";
import { mockSigner } from "@/lib/signer";

export async function POST(req: Request) {
  if (!mockSigner) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "MOCK_ONLY",
          message: "웹훅 시뮬레이터는 mock 모드에서만 사용할 수 있습니다.",
          nextAction: "MODUSIGN_MODE=mock으로 전환한 뒤 다시 시도하세요.",
        },
      },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = WebhookSimReq.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "요청 형식이 올바르지 않습니다.",
          nextAction: "docId와 event를 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }

  const payload = mockSigner.simulateEvent(parsed.data.docId, parsed.data.event);
  if (!payload) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "해당 문서를 찾을 수 없습니다.",
          nextAction: "서명 요청을 먼저 생성한 뒤 시뮬레이션하세요.",
        },
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, data: null });
}
