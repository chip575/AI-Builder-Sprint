// M-FACTS-CONFIRM — 확인·인라인 편집 (FR-103). P1을 화면으로 강제하는 유일한 지점.
import { z } from "zod";
import { IntentFact, IntentFactList } from "./extract";
import { TaxDeductionResult } from "./rules";

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
  /** 값이 바뀌면 확정은 무효다 — 화면이 재조회 없이 확정 해제를 인지하게 한다.
   *  (contract-owner PM 판단 1: 유지되면 "확정 → 수정 → 미확인 값으로 문서 생성"이 열려
   *   FR-103 수락 기준과 P1을 정면으로 뚫는다) */
  confirmedAt: z.string().datetime().nullable(),
});
export type FactPatchRes = z.infer<typeof FactPatchRes>;

/** GET /api/facts?intentId= — 확인 화면(S3) 마운트 시 현재 상태 (FR-103).
 *  POST /api/extract 재호출로 대신하지 않는다 — 그건 UPSERT라 사용자 편집분을 덮는다. */
export const FactSheetReq = z.object({
  intentId: z.string().uuid(),
});
export type FactSheetReq = z.infer<typeof FactSheetReq>;

export const FactSheetRes = IntentFactList.extend({
  intentId: z.string().uuid(),
  /** null이면 미확정. 확정 여부는 서버가 소유한 사실이다 —
   *  화면이 facts.every(confirmed)로 자체 계산하면 M-DOCUMENTS의 403 판정과 진실이 갈라진다. */
  confirmedAt: z.string().datetime().nullable(),
  /** 예상 세액공제 — 금액이 있을 때만. 계산의 소유자는 lib/rules다 (P3).
   *  ※ contract-owner 승인 제안(FactSheetRes)의 확장 — 같은 원칙("서버가 소유한 사실")을
   *     따르되 별도 리뷰 대상. FR-202가 이 화면에 산식 노출을 요구한다. */
  deduction: TaxDeductionResult.nullable(),
});
export type FactSheetRes = z.infer<typeof FactSheetRes>;
