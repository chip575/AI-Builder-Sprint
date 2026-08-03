// 분류기는 **라벨만** 고른다 — 모델이 문장을 지어내도 사용자에게 닿지 않아야 한다.
import { describe, expect, it } from "vitest";
import { MockGuideClassifier, parseLabel } from "./guide-classifier";
import { guideForLabel } from "./guide";

describe("parseLabel — 닫힌 집합 밖은 버린다", () => {
  it("정상 라벨을 읽는다", () => {
    expect(parseLabel('{"label":"DOC_TAX","doc":null}')).toEqual({ label: "DOC_TAX", doc: null });
    expect(parseLabel('{"label":"WHICH_DOC","doc":"LEGACY_GIFT_AGREEMENT"}')).toEqual({
      label: "WHICH_DOC",
      doc: "LEGACY_GIFT_AGREEMENT",
    });
  });

  it("설명이 섞여 와도 JSON만 골라낸다", () => {
    expect(parseLabel('네, 분류하면\n{"label":"WILL","doc":null}\n입니다')?.label).toBe("WILL");
  });

  it("모델이 지어낸 라벨은 버린다 — 없는 안내가 새로 생기지 않는다", () => {
    expect(parseLabel('{"label":"REFUND_POLICY","doc":null}')).toBeNull();
    expect(parseLabel('{"label":"DOC_TAX","doc":"NOT_A_DOC"}')).toEqual({
      label: "DOC_TAX",
      doc: null, // 서류만 버리고 라벨은 살린다
    });
  });

  it("NONE·빈 응답·깨진 JSON은 안내하지 않는다", () => {
    expect(parseLabel('{"label":"NONE","doc":null}')).toBeNull();
    expect(parseLabel("")).toBeNull();
    expect(parseLabel("{label: DOC_TAX")).toBeNull();
  });
});

describe("guideForLabel — 문장은 언제나 코드 것이다", () => {
  it("라벨이 무엇이든 코드 표의 문단이 나온다", () => {
    expect(guideForLabel("DOC_TAX", "연말정산 되나요?", "DONATION_PLEDGE")?.reply).toContain(
      "확인 화면",
    );
    expect(guideForLabel("DOC_REVOKE", "후회하면요?", "DONATION_PLEDGE")?.reply).toContain(
      "되돌릴 수 없습니다",
    );
    expect(guideForLabel("WILL", "유언이요", null)?.reply).toContain("전자서명으로 만들 수 없습니다");
  });

  it("분류기가 고른 서류가 추천으로 이어진다 — 화면이 문을 연다", () => {
    const g = guideForLabel("WHICH_DOC", "재산을 사회에 환원하고 싶어요", null, "DONATION_PLEDGE");
    expect(g?.suggestedDoc).toBe("DONATION_PLEDGE");
  });

  it("모르는 라벨에는 아무 문장도 만들지 않는다", () => {
    expect(guideForLabel("REFUND_POLICY", "환불되나요?", null)).toBeNull();
  });
});

describe("mock 분류기", () => {
  it("항상 null — 규칙만으로 판정하던 때와 똑같이 동작한다 (결정론)", async () => {
    expect(await new MockGuideClassifier().classify()).toBeNull();
  });
});
