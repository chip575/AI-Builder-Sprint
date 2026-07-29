// M-MOCK — POST /api/dev/webhook-sim (NFR-707)
// mock signer(외부 세계)에 이벤트를 주입하고, 그 페이로드를 실제 웹훅 경로로 전달한다.
// HTTP 왕복 없이 핸들러 직접 호출 — 멱등·아웃박스·증빙까지 실경로가 그대로 돈다.
import { NextResponse } from "next/server";
import { WebhookSimReq } from "@/lib/contracts";
import { mockSigner } from "@/lib/signer";
import { POST as webhookPost } from "../../webhooks/modusign/route";

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

  // 실제 webhook 경로 실행 — 시크릿이 설정돼 있으면 정식 헤더로 전달
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.MODUSIGN_WEBHOOK_SECRET;
  if (secret) headers["x-webhook-secret"] = secret;
  await webhookPost(
    new Request("http://localhost/api/webhooks/modusign", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }),
  );

  return NextResponse.json({ ok: true, data: null });
}
