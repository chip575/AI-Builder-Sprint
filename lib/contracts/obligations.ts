// M-OBLIGATIONS — 이행 관리 크론 (FR-204 · FR-508). 생애주기의 핵심.
// M-TIMETRAVEL — 시간 압축 데모 (NFR-707). 실제 스케줄러·상태머신을 그대로 통과시킨다.
import { z } from "zod";

export const ObligationKind = z.enum([
  "RECURRING_RENEWAL",  // 정기후원 다음 회차 갱신 확인
  "WILL_REVIEW",        // 유언 관련 문서 재검토
  "RESUME_INVITE",      // 이어쓰기 초대 (FR-113 — 독촉 아님, 긴급성 문구 금지)
]);
export type ObligationKind = z.infer<typeof ObligationKind>;

export const Obligation = z.object({
  id: z.string().uuid(),
  kind: ObligationKind,
  subjectId: z.string().uuid(),  // 대상 문서·세션
  dueAt: z.string().datetime(),
  firedAt: z.string().datetime().nullish(),
});
export type Obligation = z.infer<typeof Obligation>;

export const ObligationFireRes = z.object({
  fired: z.number().int().nonnegative(),
  obligations: z.array(Obligation),
});
export type ObligationFireRes = z.infer<typeof ObligationFireRes>;

export const AdvanceTimeReq = z.object({
  months: z.union([z.literal(6), z.literal(12)]),
});
export type AdvanceTimeReq = z.infer<typeof AdvanceTimeReq>;

export const FiredObligations = z.object({
  advancedMonths: z.number().int().positive(),
  firedObligations: z.array(Obligation),
});
export type FiredObligations = z.infer<typeof FiredObligations>;
