// M-WEBHOOK — 모두싸인 웹훅 (FR-503 · 02.3 §3)
// 응답은 항상 즉시 200 (10초 제한 회피). 처리는 아웃박스로 비동기.
// 웹훅은 문서 ID와 요청자 이메일만 준다 → 수신 후 상세 조회로 보강.
import { z } from "zod";

export const ModusignWebhookPayload = z.object({
  /** 멱등성 키 — webhook_events에 ON CONFLICT DO NOTHING */
  eventId: z.string(),
  event: z.string(),                 // 외부 이벤트명 원문 (상태 머신 매핑은 코드가)
  documentId: z.string(),            // 모두싸인 문서 ID
  requesterEmail: z.string().email().nullish(),
  /** 요청 시 심어둔 역참조 — metadata.draftId (02.3 §1 준비작업 3) */
  metadata: z.record(z.string(), z.string()).nullish(),
  occurredAt: z.string().datetime().nullish(),
});
export type ModusignWebhookPayload = z.infer<typeof ModusignWebhookPayload>;

// M-MOCK — 웹훅 시뮬레이터 (NFR-707). 실제 webhook 경로를 그대로 태운다.
export const WebhookSimReq = z.object({
  docId: z.string(),
  event: z.string(),
});
export type WebhookSimReq = z.infer<typeof WebhookSimReq>;
