// 프롬프트 검사 — **조각이 아니라 조립 결과**를 본다.
//
// 스냅샷을 쓰는 이유: 상수만 파일로 빼두면 리뷰어는 "safety에 한 줄 추가됨"만 보고,
// *그래서 자필유언 대화에 실제로 뭐가 들어가는가*는 알 수 없다. 스냅샷은 조립된 전문을
// 커밋에 남겨서, 프롬프트를 건드린 PR의 diff에 **모델이 받는 문장**이 그대로 뜨게 한다.
// 바꿀 의도였으면 `vitest -u`로 갱신하고 그 diff를 리뷰에 올린다 — 막는 장치가 아니라
// 보이게 하는 장치다.
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, type PromptInput } from "./system-prompt";

const base: PromptInput = {
  branchType: null,
  knownFacts: [],
  missingRequired: [],
  nextAxisQuestion: null,
};

describe("조립 결과 스냅샷", () => {
  it("축(회상) × 질문은행이 고른 질문", () => {
    expect(
      buildSystemPrompt({ ...base, nextAxisQuestion: "가장 오래 머무신 동네는 어디였나요?" }),
    ).toMatchSnapshot();
  });

  it("기부 × 슬롯 남음", () => {
    expect(
      buildSystemPrompt({
        ...base,
        branchType: "DONATION_NOW",
        knownFacts: [{ key: "region", value: "부산" }],
        missingRequired: ["amount"],
      }),
    ).toMatchSnapshot();
  });

  it("유산 × 슬롯 완성", () => {
    expect(
      buildSystemPrompt({
        ...base,
        branchType: "LEGACY_GIFT",
        knownFacts: [{ key: "orgName", value: "부산문화재단" }],
        missingRequired: [],
      }),
    ).toMatchSnapshot();
  });

  it("자필유언 × 아무것도 모름", () => {
    expect(buildSystemPrompt({ ...base, branchType: "HANDWRITTEN_WILL" })).toMatchSnapshot();
  });
});

describe("어떤 조합에도 무너지면 안 되는 것", () => {
  const combos: PromptInput[] = [
    base,
    { ...base, nextAxisQuestion: "무엇을 남기고 싶으신가요?" },
    { ...base, branchType: "DONATION_NOW", missingRequired: ["amount"] },
    { ...base, branchType: "HERITAGE_SUPPORT" },
    { ...base, branchType: "LEGACY_GIFT", knownFacts: [{ key: "amount", value: 5_000_000 }] },
    { ...base, branchType: "HANDWRITTEN_WILL" },
    { ...base, branchType: "ESTATE" },
  ];

  it("법률 수치가 섞이지 않는다 (P3 · 절대규칙 2) — gate:check와 이중으로 건다", () => {
    for (const c of combos) {
      const p = buildSystemPrompt(c);
      // 공제율·한도·기한이 프롬프트로 새는 형태: 백분율과 원 단위 금액
      expect(p, JSON.stringify(c.branchType)).not.toMatch(/\d+(\.\d+)?%/);
      expect(p, JSON.stringify(c.branchType)).not.toMatch(/[\d,]{4,}\s*원/);
    }
  });

  it("재촉 표현이 없다 (P4) — 규칙으로 금지해 놓고 본문에서 쓰지 않는다", () => {
    for (const c of combos) {
      // "'지금', '빨리'를 쓰지 않는다"는 규칙 문장 자체는 인용부호 안에 있다.
      // 인용을 걷어낸 뒤에 재는 이유가 그것이다 — 금지어를 설명하는 문장까지 잡으면
      // 규칙을 적을 수가 없다
      const withoutQuotes = buildSystemPrompt(c).replace(/'[^']*'/g, "");
      expect(withoutQuotes, JSON.stringify(c.branchType)).not.toMatch(/빨리|놓치기 전에/);
    }
  });

  it("자필유언에는 서명을 권하는 말이 없다 (절대규칙 4 · 민법 §1066)", () => {
    const p = buildSystemPrompt({ ...base, branchType: "HANDWRITTEN_WILL" });
    expect(p).toContain("서명을 권하지 않는다");
    expect(p).toContain("자필");
  });

  it("가지가 있으면 그 가지의 목표가 들어간다 — 통과 케이스", () => {
    // 막히는 것만 재면 "전부 막는 검사"와 구분할 수 없다 (AGENTS.md 테스트 절)
    expect(buildSystemPrompt({ ...base, branchType: "ESTATE" })).toContain(
      "무엇이 어디에 있는지",
    );
    expect(buildSystemPrompt({ ...base, branchType: "HERITAGE_SUPPORT" })).toContain(
      "문화유산",
    );
  });
});
