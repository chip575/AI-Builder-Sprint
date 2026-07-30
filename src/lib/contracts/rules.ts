// M-RULES-DONATION 출력 계약 (FR-202)
// ⚠ 이 파일에 법률 수치(공제율·한도)를 넣지 않는다. 수치의 유일한 거처는
//   lib/rules/hometown-donation.ts이고, 여기는 계산 "결과"의 모양만 정의한다.
import { z } from "zod";

export const TaxDeductionResult = z.object({
  donationAmount: z.number().positive(),
  deductionAmount: z.number().nonnegative(),
  /** 구간별 산식 분해 — UI에 "10만(전액) + …" 형태로 노출 */
  breakdown: z.array(
    z.object({
      label: z.string(),
      base: z.number().nonnegative(),
      deducted: z.number().nonnegative(),
    }),
  ),
  isSpecialDisasterArea: z.boolean(),
  /** "예상 금액이며 개인의 결정세액에 따라 달라짐" — 항상 표시 (FR-202) */
  disclaimer: z.string(),
  /** 근거 룰테이블 검증일 (P3 — 갱신일자 노출) */
  ruleVerifiedAt: z.string(),
});
export type TaxDeductionResult = z.infer<typeof TaxDeductionResult>;
