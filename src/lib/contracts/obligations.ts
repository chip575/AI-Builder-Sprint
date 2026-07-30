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

/** M-OBSERVABILITY — GET /api/admin/pipeline-stats (NFR-709)
 *  6단계 실행 지표. CONVERSE의 ms는 **첫 토큰까지의 시간**이다 —
 *  NFR-702가 명시한 기준이 첫 토큰 2초이므로, 그 수치가 곧 준수의 증거가 된다. */
export const PipelineStageStat = z.object({
  stage: z.enum(["CONVERSE", "EXTRACT", "GATE", "DRAFT", "SIGN", "CUSTODY"]),
  success: z.number().int().nonnegative(),
  fail: z.number().int().nonnegative(),
  p50Ms: z.number().int().nonnegative().nullable(),
  p95Ms: z.number().int().nonnegative().nullable(),
});
export type PipelineStageStat = z.infer<typeof PipelineStageStat>;

export const PipelineStatsRes = z.object({
  stages: z.array(PipelineStageStat),
  totalRecords: z.number().int().nonnegative(),
});
export type PipelineStatsRes = z.infer<typeof PipelineStatsRes>;
