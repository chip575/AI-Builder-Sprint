// handoff — 잡아야 할 상태와 **넘겨야 할 상태**를 쌍으로 잰다 (AGENTS.md 테스트 절).
// 이 모듈이 생긴 이유: 숙려 결정을 대화가 물어서 생긴 도돌이표 (2026-08-02).
import { describe, expect, it } from "vitest";
import { handoffReply } from "./handoff";

const base = {
  branchType: "LEGACY_GIFT" as const,
  missingRequired: [] as string[],
  knownFacts: [
    { key: "orgName", value: "부산문화재단" },
    { key: "amount", value: 5_000_000 },
  ],
  pendingReconfirm: null as "EXPRESS" | "DETECTED" | null,
};

describe("handoff — 다음 행동이 화면에 있으면 코드가 말한다", () => {
  it("숙려 대기(EXPRESS) → 버튼을 가리킨다. 같은 질문을 되풀이하지 않는다", () => {
    const r = handoffReply({ ...base, pendingReconfirm: "EXPRESS" });
    expect(r).toContain("버튼");
    expect(r).toContain("기록으로 남");
    // P4 — 결정을 미룰 자유가 문장에 남아 있어야 한다
    expect(r).toContain("더 생각하셔도");
  });

  it("재확인 대기(DETECTED) → 다음 세션을 안내한다 (FR-115B)", () => {
    const r = handoffReply({ ...base, pendingReconfirm: "DETECTED" });
    expect(r).toContain("다음에 오셨을 때");
  });

  it("슬롯 완성 → 값을 되읽고 확인 화면으로 인계한다", () => {
    const r = handoffReply(base);
    expect(r).toContain("부산문화재단");
    expect(r).toContain("5,000,000원");
    expect(r).toContain("확인 버튼");
  });

  it("모든 인계 문구에 재촉 표현이 없다 (P4)", () => {
    for (const p of ["EXPRESS", "DETECTED", null] as const) {
      const r = handoffReply({ ...base, pendingReconfirm: p });
      expect(r, String(p)).not.toMatch(/지금 |빨리|놓치기 전에/);
    }
  });
});

describe("handoff — 대화가 할 일이 남았으면 넘긴다 (LLM의 차례)", () => {
  it("빈 슬롯이 있으면 null — 응답기가 물어야 한다", () => {
    expect(
      handoffReply({
        branchType: "DONATION_NOW",
        missingRequired: ["amount"],
        knownFacts: [{ key: "region", value: "부산" }],
        pendingReconfirm: null,
      }),
    ).toBeNull();
  });

  it("축(회상) 대화는 항상 null — 인계할 화면이 없다", () => {
    expect(
      handoffReply({
        branchType: null,
        missingRequired: [],
        knownFacts: [],
        pendingReconfirm: null,
      }),
    ).toBeNull();
  });

  it("가지가 열렸지만 아직 아무것도 못 들었으면 null — 첫 질문은 응답기 몫", () => {
    expect(
      handoffReply({
        branchType: "LEGACY_GIFT",
        missingRequired: [],
        knownFacts: [],
        pendingReconfirm: null,
      }),
    ).toBeNull();
  });
});
