// M-FACTS-CONFIRM — 확인·인라인 편집 (FR-103). P1을 화면으로 강제하는 유일한 지점.
import { z } from "zod";
import { IntentFact } from "./extract";

export const FactPatch = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});
export type FactPatch = z.infer<typeof FactPatch>;
// confirmed 제거 (contract-owner 제안 2026-07-29, PM 적용) —
// 확정은 값 수정과 별개 경로(POST /api/facts/confirm)로만 일어난다 (P1).

/** 세션(intent) 단위 일괄 확정 — FR-103 "확인 버튼" 그 자체 */
export const FactsConfirmReq = z.object({
  intentId: z.string().uuid(),
});
export type FactsConfirmReq = z.infer<typeof FactsConfirmReq>;

export const FactsConfirmRes = z.object({
  intentId: z.string().uuid(),
  /** 이 호출로 확정된 fact 수 */
  confirmedCount: z.number().int().nonnegative(),
  confirmedAt: z.string().datetime(),
});
export type FactsConfirmRes = z.infer<typeof FactsConfirmRes>;
// 필수 항목 미완 상태의 confirm은 성공 필드가 아니라
// { ok:false, error:{ code:"FACTS_INCOMPLETE" } } envelope로 거부한다 (FR-102).

/** 수정이 계산에 영향을 주면 재계산 내역을 함께 반환 (FR-103 — "즉시 반영·재계산") */
export const Recalc = z.object({
  field: z.string(),
  oldValue: z.number(),
  newValue: z.number(),
  formula: z.string(), // 사람이 읽는 산식 — 수치는 lib/rules 계산 결과다
});
export type Recalc = z.infer<typeof Recalc>;

export const FactPatchRes = z.object({
  fact: IntentFact,
  recalc: Recalc.nullish(),
});
export type FactPatchRes = z.infer<typeof FactPatchRes>;
