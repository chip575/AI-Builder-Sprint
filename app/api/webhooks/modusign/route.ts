// M-WEBHOOK — POST /api/webhooks/modusign (FR-503 · 02.3 §3)
// 항상 즉시 200. 신규 삽입일 때만 아웃박스 드레인으로 넘어간다 —
// DO NOTHING이 버린 중복은 200만 반환하고 아무 일도 하지 않는다 (멱등).
// 형식 오류·모르는 문서도 200 — 4xx는 모두싸인 재시도(5회)를 유발할 뿐이다.
import { ModusignWebhookPayload } from "@/lib/contracts";
import { store } from "@/lib/store";
import { drainOutbox } from "./outbox";

const ok = () => Response.json({ ok: true, data: null }); // out: always-200

export async function POST(req: Request) {
  // 시크릿 검증 — 설정된 경우에만 (mock 모드는 미설정). 인증 실패만 200이 아니다:
  // 위조 요청에 200을 주면 공격자가 성공으로 오인하고, 정식 재시도와 구분도 안 된다.
  const secret = process.env.MODUSIGN_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-webhook-secret") !== secret) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "웹훅 서명 검증에 실패했습니다.",
          nextAction: "웹훅 시크릿 설정을 확인하세요.",
        },
      },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = ModusignWebhookPayload.safeParse(body);
  if (!parsed.success) {
    // 스키마 드리프트로 재시도 폭주를 만들지 않는다 — 기록만 남기고 200
    console.warn("[webhook] 페이로드 형식 불일치 — 무시:", parsed.error.issues[0]?.message);
    return ok();
  }

  const result = await store.insertWebhookEvent({
    externalEventId: parsed.data.eventId,
    event: parsed.data.event,
    modusignDocumentId: parsed.data.documentId,
    payload: parsed.data,
  });

  if (result === "INSERTED") {
    // fire-and-forget — 응답을 막지 않는다. 실패해도 미처리로 남아 다음 드레인이 줍는다
    void drainOutbox().catch((err) =>
      console.warn("[webhook] 드레인 실패 — 다음 기회에 재시도:", (err as Error).message),
    );
  }
  return ok();
}
