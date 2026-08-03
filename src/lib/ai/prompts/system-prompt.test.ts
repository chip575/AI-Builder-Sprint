// 프롬프트 검사 — **조각이 아니라 조립 결과**를 본다.
//
// 스냅샷을 쓰는 이유: 상수만 파일로 빼두면 리뷰어는 "safety에 한 줄 추가됨"만 보고,
// *그래서 자필유언 대화에 실제로 뭐가 들어가는가*는 알 수 없다. 스냅샷은 조립된 전문을
// 커밋에 남겨서, 프롬프트를 건드린 PR의 diff에 **모델이 받는 문장**이 그대로 뜨게 한다.
// 바꿀 의도였으면 `vitest -u`로 갱신하고 그 diff를 리뷰에 올린다 — 막는 장치가 아니라
// 보이게 하는 장치다.
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, type PromptInput } from "./system-prompt";

/** asset-readback이 만드는 모양. 여기서 값을 새로 만들지 않는다 —
 *  문장 규칙은 저쪽 검사가 본다 */
const ASSET_LINE = "저희가 확인한 자산은 금융 1건 45,000,000원입니다.";

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

  it("마음 편지 — 가지 표에 없는 서류를 명시로 넘긴 경우", () => {
    expect(buildSystemPrompt({ ...base, docType: "HEART_LETTER" })).toMatchSnapshot();
  });

  it("유산 × 재산 있음 — 재산 절이 붙은 전문", () => {
    expect(
      buildSystemPrompt({ ...base, branchType: "LEGACY_GIFT", assetLine: ASSET_LINE }),
    ).toMatchSnapshot();
  });

  it("기부 × 재산 있음 — 같은 재산에 반대 지시가 붙는다", () => {
    expect(
      buildSystemPrompt({
        ...base,
        branchType: "DONATION_NOW",
        missingRequired: ["amount"],
        assetLine: ASSET_LINE,
      }),
    ).toMatchSnapshot();
  });
});

/** 실제로 나올 수 있는 조합 — 검사마다 이 전부를 훑는다.
 *  하나씩 골라 재면 "그 조합에서만 맞는" 검사가 된다 */
const combos: PromptInput[] = [
  base,
  { ...base, nextAxisQuestion: "무엇을 남기고 싶으신가요?" },
  { ...base, branchType: "DONATION_NOW", missingRequired: ["amount"] },
  { ...base, branchType: "HERITAGE_SUPPORT" },
  { ...base, branchType: "LEGACY_GIFT", knownFacts: [{ key: "amount", value: 5_000_000 }] },
  { ...base, branchType: "HANDWRITTEN_WILL" },
  { ...base, branchType: "ESTATE" },
  { ...base, docType: null },
  { ...base, docType: "HEART_LETTER" },
];

describe("어떤 조합에도 무너지면 안 되는 것", () => {
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
    // 가지 목표가 아니라 **서류 주의**로도 걸린다 — 흐름이 바뀌어도 따라오게
    expect(p).toContain("서명 링크를 언급하지 않는다");
  });
});

describe("서류별 주의 — 그 서류에만 붙는다", () => {
  const noteOf = (docType: Parameters<typeof buildSystemPrompt>[0]["docType"]) =>
    buildSystemPrompt({ ...base, docType });

  it.each([
    ["INTENT_AFFIRMATION", "'유언' 또는 '유언장'이라고 부르지 않는다"], // FR-551
    ["CUSTODIAN_AGREEMENT", "유언집행자가 아니다"],
    ["HEART_LETTER", "법적 효력이 있는 서류가 아니다"],
    ["VOLUNTEER_PLEDGE", "금액을 묻지 않는다"],
  ] as const)("%s → %s", (docType, phrase) => {
    expect(noteOf(docType)).toContain(phrase);
  });

  it("다른 서류의 주의가 섞이지 않는다 — 교차 오염 검사", () => {
    // 서류별 주의를 한 덩어리로 붙이면 기부 대화에 유언 주의가 따라온다.
    // 그러면 모델이 "이건 서명이 안 됩니다"를 기부 약정서에 대고 말한다
    const donation = noteOf("DONATION_PLEDGE");
    expect(donation).not.toContain("서명 링크를 언급하지 않는다");
    expect(donation).not.toContain("유언집행자");
  });

  it("가지에서 서류를 유도한다 — 넘기지 않아도 붙는다", () => {
    // ESTATE → CUSTODIAN_AGREEMENT (lib/rules/branch-doc)
    expect(buildSystemPrompt({ ...base, branchType: "ESTATE" })).toContain("유언집행자가 아니다");
  });

  it("명시한 서류가 유도값을 이긴다", () => {
    const p = buildSystemPrompt({ ...base, branchType: "ESTATE", docType: "HEART_LETTER" });
    expect(p).toContain("법적 효력이 있는 서류가 아니다");
    expect(p).not.toContain("유언집행자");
  });

  it("서류가 없으면 주의도 없다 — 빈 제목만 남기지 않는다", () => {
    expect(buildSystemPrompt({ ...base, docType: null })).not.toContain("이 서류에서 조심할 것");
  });
});

describe("재산 — 가지마다 시키는 일이 반대다", () => {
  const withAssets = (branchType: PromptInput["branchType"]) =>
    buildSystemPrompt({ ...base, branchType, assetLine: ASSET_LINE });

  it("기부 → 먼저 꺼내지 말라고 시킨다. 총액이 곧 금액 제안이 된다", () => {
    for (const b of ["DONATION_NOW", "HERITAGE_SUPPORT"] as const) {
      const p = withAssets(b);
      expect(p, b).toContain("직접 묻기 전에는 꺼내지 않는다");
      expect(p, b).toContain("금액을 권하거나 비교하지 않는다");
      // 유산 쪽 지시가 새어 들어오면 안 된다
      expect(p, b).not.toContain("근거로 삼는다");
    }
  });

  it("유산 → 근거로 삼되 목록을 전부로 취급하지 말라고 시킨다", () => {
    for (const b of ["LEGACY_GIFT", "ESTATE"] as const) {
      const p = withAssets(b);
      expect(p, b).toContain("근거로 삼는다");
      expect(p, b).toContain("목록에 없는 것을 있는 것처럼 말하지 않는다");
      expect(p, b).not.toContain("직접 묻기 전에는 꺼내지 않는다");
    }
  });

  it("자필유언 → 알려는 주되 대신 골라 주지 않는다", () => {
    const p = withAssets("HANDWRITTEN_WILL");
    expect(p).toContain("네가 목록에서 골라 주지 않는다");
  });

  it("어느 가지든 더하지 말라·전 재산이라 하지 말라가 붙는다", () => {
    for (const b of [null, "DONATION_NOW", "LEGACY_GIFT", "HANDWRITTEN_WILL"] as const) {
      const p = withAssets(b);
      expect(p, String(b)).toContain("숫자를 바꾸거나 더하거나 빼지 않는다");
      expect(p, String(b)).toContain("전 재산이라고 말하지 않는다");
      expect(p, String(b)).toContain(ASSET_LINE); // 문장은 그대로 실린다
    }
  });

  it("사용자 금액은 들어가도 된다 — 그건 법률 수치가 아니다 (P3 경계)", () => {
    // 절대규칙 2가 막는 것은 **공제율·한도·기한**이다. 사용자가 자기 예금이 얼마인지는
    // 그 사람의 사실이고, lib/rules가 소유하는 값이 아니다. 이 구분이 흐려지면
    // "숫자가 보이니 지우자"가 되어 재산 문장 자체가 사라진다
    expect(withAssets("LEGACY_GIFT")).toContain("45,000,000원");
  });

  it("재산 문장이 없으면 그 절이 통째로 빠진다 — 빈 지시만 남기지 않는다", () => {
    // 조회 실패(null)일 때 "아래는 우리가 확인한 재산이다"만 남고 문장이 없으면,
    // 모델은 없는 목록을 지어낸다
    const p = buildSystemPrompt({ ...base, branchType: "LEGACY_GIFT", assetLine: null });
    expect(p).not.toContain("아래는 우리가 확인한 재산이다");
  });

  it("안내의 한계와 문의처가 조건 없이 들어간다 (법률·세무 리스크)", () => {
    // 서류를 만드는 일은 잘 하면서 "상속세 얼마 나와요"에 그럴듯하게 답하던 구멍.
    // 법률·세무에서 그럴듯한 오답은 침묵보다 나쁘다 — 사용자가 믿고 움직인다
    for (const c of combos) {
      const p = buildSystemPrompt(c);
      expect(p, JSON.stringify(c)).toContain("답하지 않는 것");
      expect(p, JSON.stringify(c)).toContain("유류분이 얼마인지");
      expect(p, JSON.stringify(c)).toContain("세액을 계산하거나 어림잡아 말하지 않는다");
      // 거절만 하고 끝내지 않는다 — 어디로 갈지가 함께 있어야 한다
      expect(p, JSON.stringify(c)).toContain("대한법률구조공단");
      expect(p, JSON.stringify(c)).toContain("국세상담센터");
    }
  });

  it("서류 만들기는 우리 일이라고 남겨 둔다 — 통과 케이스", () => {
    // 한계만 걸면 "아무것도 안 하는 상담원"이 된다. 무엇을 하는지가 함께 있어야 한다
    const p = buildSystemPrompt(base);
    expect(p).toContain("서류를 만드는 일");
    expect(p).toContain("확인 화면이 계산한다");
  });

  it("보안 조항은 조건 없이 들어간다 — 가지도 서류도 없을 때까지 포함", () => {
    // 조건이 붙으면 언젠가 그 조건이 거짓인 경로가 생기고, 그때 조용히 빠진다
    for (const c of combos) {
      const p = buildSystemPrompt(c);
      expect(p, JSON.stringify(c)).toContain("절대 하지 않는 것");
      expect(p, JSON.stringify(c)).toContain("계좌번호");
      expect(p, JSON.stringify(c)).toContain("서명 링크");
    }
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
