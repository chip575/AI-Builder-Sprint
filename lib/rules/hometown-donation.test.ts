// FR-202 검산 3케이스 — spec/00.1-rules.md §5의 예시를 그대로 유닛테스트로 (AGENTS.md 테스트 규칙)
import { describe, expect, it } from "vitest";
import {
  checkAnnualCap,
  checkRewardLimit,
  computeTaxDeduction,
} from "./hometown-donation";

describe("FR-202 세액공제 검산 3케이스", () => {
  it("100만원 → 276,000원 (10만 전액 + 4.4만 + 13.2만)", () => {
    const r = computeTaxDeduction(1_000_000);
    expect(r.deductionAmount).toBe(276_000);
    expect(r.breakdown).toHaveLength(3);
    expect(r.breakdown[0]?.deducted).toBe(100_000);
    expect(r.breakdown[1]?.deducted).toBe(44_000);
    expect(r.breakdown[2]?.deducted).toBe(132_000);
  });

  it("특별재난지역 100만원 → 408,000원", () => {
    const r = computeTaxDeduction(1_000_000, true);
    expect(r.deductionAmount).toBe(408_000);
    expect(r.isSpecialDisasterArea).toBe(true);
  });

  it("10만원 → 100,000원 전액 공제", () => {
    const r = computeTaxDeduction(100_000);
    expect(r.deductionAmount).toBe(100_000);
    expect(r.breakdown).toHaveLength(1);
  });

  it("결과에는 항상 비확정 고지와 룰 검증일이 붙는다 (P3)", () => {
    const r = computeTaxDeduction(500_000);
    expect(r.disclaimer).toContain("예상");
    expect(r.ruleVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("FR-203 답례품 한도", () => {
  it("10만원 기부 → 한도 3만원, 초과 조합은 overLimit", () => {
    expect(checkRewardLimit(100_000, 30_000).overLimit).toBe(false);
    expect(checkRewardLimit(100_000, 30_001).overLimit).toBe(true);
    expect(checkRewardLimit(100_000, 0).limit).toBe(30_000);
  });
});

describe("FR-201 연간 상한", () => {
  it("누적 + 신규가 상한을 넘으면 경고", () => {
    const cap = checkAnnualCap(0, 1).cap;
    expect(checkAnnualCap(cap - 1, 1).wouldExceed).toBe(false);
    expect(checkAnnualCap(cap, 1).wouldExceed).toBe(true);
  });
});
