// 재산 문장 — 여기서 틀리면 **약정서에 틀린 숫자가 인쇄된다.**
// 그래서 검사의 무게중심이 "무엇을 말하나"가 아니라 **"무엇을 말하지 않나"** 에 있다.
import { describe, expect, it } from "vitest";
import type { InventorySummary } from "@/lib/contracts";
import { assetReadback } from "./asset-readback";

const summary = (over: Partial<InventorySummary> = {}): InventorySummary => ({
  totalCount: 0,
  byCategory: [],
  unconfirmedCount: 0,
  lowConfidenceCount: 0,
  hasDebt: false,
  debtNotice: null,
  ...over,
});

describe("못 읽은 것과 없는 것은 다르다", () => {
  it("조회 실패(null) → null. 문장을 만들지 않는다", () => {
    // 못 읽었는데 "확인한 자산이 없습니다"라고 말하면 거짓이다 (보안 7조)
    expect(assetReadback(null)).toBeNull();
  });

  it("0건 → '저희가 확인한' 자산이 없다고 말한다", () => {
    const r = assetReadback(summary())!;
    expect(r).toContain("저희가 확인한 자산이 없습니다");
    // "등록된 자산이 없습니다"는 "당신은 재산이 없다"로 읽힌다 — 거짓이다
    expect(r).not.toContain("등록된 자산이 없습니다");
    // 우리가 아는 경로를 밝힌다 — 사용자가 "얘는 서류로만 아는구나"를 알게
    expect(r).toContain("서류");
  });
});

describe("합계 — 부분을 전체인 척하지 않는다", () => {
  it("금액이 다 있으면 합계를 낸다", () => {
    const r = assetReadback(
      summary({
        totalCount: 2,
        byCategory: [
          { category: "REAL_ESTATE", count: 1, estimatedTotalKrw: 300_000_000 },
          { category: "FINANCIAL", count: 1, estimatedTotalKrw: 45_000_000 },
        ],
      }),
    )!;
    expect(r).toContain("부동산 1건");
    expect(r).toContain("345,000,000원");
  });

  it("금액 미상이 섞이면 합계를 내지 않는다 (summarize의 null 규칙을 문장으로)", () => {
    const r = assetReadback(
      summary({
        totalCount: 2,
        byCategory: [
          { category: "REAL_ESTATE", count: 1, estimatedTotalKrw: null },
          { category: "FINANCIAL", count: 1, estimatedTotalKrw: 45_000_000 },
        ],
      }),
    )!;
    expect(r).toContain("금액 미기재");
    expect(r).toContain("합계는 말씀드리지 않습니다");
    expect(r).not.toContain("합하면");
  });

  it("채무를 자산 합계에 더하지 않는다 — 방향이 반대인 값이다", () => {
    // 상속은 채무도 승계하지만 그건 빼는 쪽이다. 한 줄에 섞으면 재산이
    // 실제와 반대 방향으로 틀린다
    const r = assetReadback(
      summary({
        totalCount: 2,
        hasDebt: true,
        byCategory: [
          { category: "FINANCIAL", count: 1, estimatedTotalKrw: 45_000_000 },
          { category: "DEBT", count: 1, estimatedTotalKrw: 20_000_000 },
        ],
      }),
    )!;
    expect(r).toContain("합하면 45,000,000원"); // 65,000,000이 아니다
    expect(r).not.toContain("65,000,000");
    expect(r).toContain("채무가 1건"); // 안 숨긴다. 따로 말한다
  });

  it("자산 없이 채무만 있으면 그렇게 말한다", () => {
    const r = assetReadback(
      summary({
        totalCount: 1,
        hasDebt: true,
        byCategory: [{ category: "DEBT", count: 1, estimatedTotalKrw: null }],
      }),
    )!;
    expect(r).toContain("채무뿐");
  });
});

describe("항상 붙는 것 / 붙지 않는 것", () => {
  const filled = summary({
    totalCount: 1,
    byCategory: [{ category: "FINANCIAL", count: 1, estimatedTotalKrw: 45_000_000 }],
  });

  it("한계 고지가 항상 붙는다 — 없으면 합계가 '전 재산'으로 읽힌다", () => {
    for (const s of [summary(), filled]) {
      expect(assetReadback(s)!).toContain("까지만 알 수 있습니다");
    }
  });

  it("0건 카테고리를 '0건'으로 말하지 않는다 — 빈칸을 사실처럼 읽게 된다", () => {
    expect(assetReadback(filled)!).not.toContain("0건");
  });

  it("미확정이 있으면 알리고, 없으면 말하지 않는다 (P1) — 쌍으로", () => {
    expect(assetReadback({ ...filled, unconfirmedCount: 2 })!).toContain(
      "아직 확인하지 않으신 항목이 2건",
    );
    expect(assetReadback(filled)!).not.toContain("아직 확인하지 않으신");
  });
});
