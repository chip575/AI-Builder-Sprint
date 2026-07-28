// M-RULES-DONATION — 고향사랑기부제 룰 테이블 (FR-202 · FR-203 · spec/00.1-rules.md §5)
//
// ⚠ 법률 수치의 유일한 거처다. 다른 파일에 이 수치를 복사하지 않는다.
//   LLM 프롬프트에는 절대 넣지 않는다 — [CALC:항목] 토큰만 (CLAUDE.md 절대규칙 2).
// ⚠ human_review: required — 에이전트 단독 변경 금지 (AGENTS.md 보안 5조).
//   변경 시 검산 3케이스 유닛테스트가 먼저 갱신되어야 한다.
import type { TaxDeductionResult } from "../contracts/rules";

/** 모든 상수에 sourceUrl·verifiedAt을 붙인다 (00.1 룰테이블 관리 규칙) */
interface RuleConst {
  value: number;
  sourceUrl: string;
  verifiedAt: string; // YYYY-MM-DD
}

const LAW = "https://www.law.go.kr/법령/고향사랑기부금에관한법률";
const VERIFIED = "2026-07-28"; // ClickUp 00.1 내려받은 날 기준

export const DONATION_RULES = {
  /** 연간 기부 상한 — 2025.1.1~ 상향 (기존 5백만원) */
  annualCap: { value: 20_000_000, sourceUrl: LAW, verifiedAt: VERIFIED },
  /** 답례품 한도 — 기부금 대비 비율. 현금·귀금속·유가증권은 데이터에 존재하지 않는다 */
  rewardRate: { value: 0.3, sourceUrl: LAW, verifiedAt: VERIFIED },
  /** 세액공제 전액 구간 상한 (~10만원 100%) */
  fullDeductCeiling: { value: 100_000, sourceUrl: LAW, verifiedAt: VERIFIED },
  /** 중간 구간 상한 (10만~20만원) */
  midCeiling: { value: 200_000, sourceUrl: LAW, verifiedAt: VERIFIED },
  /** 중간 구간 공제율 */
  midRate: { value: 0.44, sourceUrl: LAW, verifiedAt: VERIFIED },
  /** 초과 구간 기본 공제율 */
  baseRate: { value: 0.165, sourceUrl: LAW, verifiedAt: VERIFIED },
  /** 초과 구간 특별재난지역 공제율 */
  disasterRate: { value: 0.33, sourceUrl: LAW, verifiedAt: VERIFIED },
} satisfies Record<string, RuleConst>;

/** UI 상시 고지 — 확정 표현 금지 (00.1 §5) */
export const DEDUCTION_DISCLAIMER =
  "예상 공제액입니다. 세액공제는 기부자 본인에 한하고 이월공제가 없으며, 개인의 결정세액에 따라 실제 공제액이 달라집니다.";

const pct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

/**
 * 세액공제 예상액 계산 (FR-202).
 * 검산: 100만 → 276,000 / 특별재난 100만 → 408,000 / 10만 → 100,000
 */
export function computeTaxDeduction(
  donationAmount: number,
  isSpecialDisasterArea = false,
): TaxDeductionResult {
  const R = DONATION_RULES;
  const tier1Base = Math.min(donationAmount, R.fullDeductCeiling.value);
  const tier2Base = Math.min(
    Math.max(donationAmount - R.fullDeductCeiling.value, 0),
    R.midCeiling.value - R.fullDeductCeiling.value,
  );
  const tier3Base = Math.max(donationAmount - R.midCeiling.value, 0);
  const tier3Rate = isSpecialDisasterArea ? R.disasterRate.value : R.baseRate.value;

  const tier1 = tier1Base;
  const tier2 = Math.round(tier2Base * R.midRate.value);
  const tier3 = Math.round(tier3Base * tier3Rate);

  return {
    donationAmount,
    deductionAmount: tier1 + tier2 + tier3,
    breakdown: [
      { label: "10만원 이하 전액", base: tier1Base, deducted: tier1 },
      { label: `10만~20만원 구간 ${pct(R.midRate.value)}`, base: tier2Base, deducted: tier2 },
      { label: `20만원 초과 구간 ${pct(tier3Rate)}`, base: tier3Base, deducted: tier3 },
    ].filter((b) => b.base > 0),
    isSpecialDisasterArea,
    disclaimer: DEDUCTION_DISCLAIMER,
    ruleVerifiedAt: VERIFIED,
  };
}

/** 답례품 한도 검사 (FR-203) — 초과는 경고가 아니라 선택 불가 */
export function checkRewardLimit(donationAmount: number, selectedTotal: number) {
  const limit = Math.floor(donationAmount * DONATION_RULES.rewardRate.value);
  return {
    limit,
    remaining: limit - selectedTotal,
    overLimit: selectedTotal > limit,
  };
}

/** 연간 상한 검사 (FR-201) — 초과 예정이면 경고 표시 */
export function checkAnnualCap(cumulativeThisYear: number, newAmount: number) {
  const cap = DONATION_RULES.annualCap.value;
  return {
    cap,
    wouldExceed: cumulativeThisYear + newAmount > cap,
    remaining: Math.max(cap - cumulativeThisYear, 0),
  };
}
