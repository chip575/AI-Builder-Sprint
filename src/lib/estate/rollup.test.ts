// 대화와 화면이 **같은 합계**를 말하는지가 이 모듈의 존재 이유다.
// 그래서 검사도 "얼마가 나오나"보다 "언제 안 내나"에 무게를 둔다.
import { describe, expect, it } from "vitest";
import type { InventorySummary } from "../contracts";
import { ownedRollup } from "./rollup";

const summary = (byCategory: InventorySummary["byCategory"]): InventorySummary => ({
  totalCount: byCategory.reduce((s, c) => s + c.count, 0),
  byCategory,
  unconfirmedCount: 0,
  lowConfidenceCount: 0,
  hasDebt: byCategory.some((c) => c.category === "DEBT"),
  debtNotice: null,
});

describe("채무는 자산과 더하지 않는다", () => {
  it("합계에서 빠지고, 사라지지는 않는다", () => {
    // 섞어서 더하면 재산이 실제와 **반대 방향**으로 틀린다.
    // 그렇다고 숨기면 상속 판단의 핵심이 사라진다 — 빼되 따로 남긴다
    const r = ownedRollup(
      summary([
        { category: "FINANCIAL", count: 1, estimatedTotalKrw: 45_000_000 },
        { category: "DEBT", count: 1, estimatedTotalKrw: 20_000_000 },
      ]),
    );
    expect(r.total).toBe(45_000_000);
    expect(r.ownedCount).toBe(1); // 채무는 건수에도 안 들어간다
    expect(r.debt?.count).toBe(1); // 하지만 사라지지 않는다
  });

  it("채무만 있으면 자산 합계는 null — 0원이 아니다", () => {
    const r = ownedRollup(summary([{ category: "DEBT", count: 1, estimatedTotalKrw: 20_000_000 }]));
    expect(r.total).toBeNull();
    expect(r.ownedCount).toBe(0);
  });
});

describe("금액 미상이 섞이면 합계를 내지 않는다", () => {
  it("한 카테고리만 미상이어도 전체 합계가 null", () => {
    const r = ownedRollup(
      summary([
        { category: "REAL_ESTATE", count: 1, estimatedTotalKrw: null },
        { category: "FINANCIAL", count: 1, estimatedTotalKrw: 45_000_000 },
      ]),
    );
    expect(r.total).toBeNull();
    // 건수는 셀 수 있다 — 모르는 것은 금액뿐이다
    expect(r.ownedCount).toBe(2);
  });

  it("전부 알면 합계를 낸다 — 통과 케이스", () => {
    // 막는 것만 재면 "항상 null인 함수"와 구분할 수 없다 (AGENTS.md 테스트 절)
    const r = ownedRollup(
      summary([
        { category: "REAL_ESTATE", count: 1, estimatedTotalKrw: 300_000_000 },
        { category: "FINANCIAL", count: 2, estimatedTotalKrw: 45_000_000 },
      ]),
    );
    expect(r.total).toBe(345_000_000);
    expect(r.ownedCount).toBe(3);
  });
});

describe("빈 인벤토리", () => {
  it("0건이면 합계는 null이고 채무도 없다", () => {
    const r = ownedRollup(summary([]));
    expect(r.total).toBeNull();
    expect(r.ownedCount).toBe(0);
    expect(r.debt).toBeUndefined();
  });
});
