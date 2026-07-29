// M-WEBHOOK — POST /api/webhooks/modusign (FR-503 · 02.3 §3)
// 항상 즉시 200. 신규 삽입일 때만 아웃박스 드레인으로 넘어간다 —
// DO NOTHING이 버린 중복은 200만 반환하고 아무 일도 하지 않는다 (멱등).
// 형식 오류·모르는 문서도 200 — 4xx는 모두싸인 재시도(5회)를 유발할 뿐이다.
import { timingSafeEqual } from "node:crypto";
import { ModusignWebhookPayload } from "@/lib/contracts";
import { store } from "@/lib/store";
import { drainOutbox } from "./outbox";

const ok = () => Response.json({ ok: true, data: null }); // out: always-200

/** 상수 시간 비교 — 문자열 ===는 타이밍 누출이 있다. 검증 코드의 표준 */
function secretMatches(expected: string, provided: string | null): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  // FR-503 "항상 즉시 200"의 해석: **인증(시크릿)을 통과한 요청에 대해** 항상 200.
  // 인증 실패는 401 — 위조 요청에 성공 응답을 주지 않는다. (01.3 ClickUp 동기화 예정)
  const secret = process.env.MODUSIGN_WEBHOOK_SECRET;
  if (secret && !secretMatches(secret, req.headers.get("x-webhook-secret"))) {
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
