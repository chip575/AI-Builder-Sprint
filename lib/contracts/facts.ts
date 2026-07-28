// M-FACTS-CONFIRM — 확인·인라인 편집 (FR-103). P1을 화면으로 강제하는 유일한 지점.
import { z } from "zod";
import { IntentFact } from "./extract";

export const FactPatch = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  /** true = 사용자가 이 항목을 명시적으로 확정 (P1 승인) */
  confirmed: z.boolean().optional(),
});
export type FactPatch = z.infer<typeof FactPatch>;

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
