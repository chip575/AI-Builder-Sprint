// M-EXTRACT — 대화 → 구조화 추출 (FR-102, Solar structured output — IE는 문서 전용, D-06)
import { z } from "zod";

export const ExtractReq = z.object({
  intentId: z.string().uuid(),
});
export type ExtractReq = z.infer<typeof ExtractReq>;

/** 값 + 신뢰도 + 대화 원문 위치 — "이렇게 말씀하셨어요"를 띄우기 위한 3종 세트 (FR-102) */
export const SourceSpan = z.object({
  utteranceId: z.string().uuid(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  text: z.string(),
});
export type SourceSpan = z.infer<typeof SourceSpan>;

export const IntentFact = z.object({
  id: z.string().uuid(),
  key: z.string(),                        // 가지별 스키마의 슬롯 이름
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  sourceSpan: SourceSpan.nullish(),       // 없으면 추측 금지 → 되묻기
  /** AI 산출물은 confirmed=false로 시작한다 (P1). 확정은 FactSheet에서 사용자만 */
  confirmed: z.boolean(),
});
export type IntentFact = z.infer<typeof IntentFact>;

export const IntentFactList = z.object({
  facts: z.array(IntentFact),
  /** 필수 슬롯 중 비어 있어 되물어야 할 key 목록 */
  missingRequired: z.array(z.string()),
});
export type IntentFactList = z.infer<typeof IntentFactList>;
