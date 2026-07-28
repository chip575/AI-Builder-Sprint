// 금액 파싱 — 언어 처리 유닛테스트 (lib/rules 아님)
import { describe, expect, it } from "vitest";
import { parseAmount } from "./parse-amount";

describe("parseAmount — 숫자 표기 (EXPLICIT)", () => {
  it('"100만원이요" → 1,000,000 EXPLICIT', () => {
    expect(parseAmount("100만원이요")).toMatchObject({
      value: 1_000_000,
      source: "EXPLICIT",
      text: "100만원",
    });
  });

  it('"1,000,000원" · "20만 원" · "3억원"', () => {
    expect(parseAmount("1,000,000원을 내고 싶어요")?.value).toBe(1_000_000);
    expect(parseAmount("20만 원 정도요")?.value).toBe(200_000);
    expect(parseAmount("3억원")?.value).toBe(300_000_000);
  });

  it("어림 표현이 붙으면 숫자여도 PARSED — 확인 대상", () => {
    expect(parseAmount("10만원쯤 생각해요")?.source).toBe("PARSED");
  });
});

describe("parseAmount — 수사 표기 (PARSED)", () => {
  it('"한 십만원쯤" → 100,000 PARSED', () => {
    expect(parseAmount("한 십만원쯤")).toMatchObject({
      value: 100_000,
      source: "PARSED",
    });
  });

  it('"삼십만원" → 300,000 / "백만원" → 1,000,000 / "이천만원" → 20,000,000', () => {
    expect(parseAmount("삼십만원 하려고요")?.value).toBe(300_000);
    expect(parseAmount("백만원 생각 중이에요")?.value).toBe(1_000_000);
    expect(parseAmount("이천만원이요")?.value).toBe(20_000_000);
  });

  it("금액 없는 발화 → null (추측하지 않는다, FR-102)", () => {
    expect(parseAmount("부산에 기부하고 싶어요")).toBeNull();
    expect(parseAmount("어머니 생각이 나요")).toBeNull();
  });
});
