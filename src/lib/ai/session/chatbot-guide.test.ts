// 화면의 설명이 **코드가 실제로 하는 일**과 어긋나지 않게 잰다.
//
// 설명을 화면에 손으로 적어 두면 코드가 바뀌어도 옛말로 남는다. 이 파일이
// 그 어긋남을 잡는다 — 문구가 아니라 "약속"을 검사한다.
import { describe, expect, it } from "vitest";
import { CHATBOT_GUIDE } from "./chatbot-guide";
import { detectGuide } from "./guide";

describe("화면 설명 ↔ 안내층", () => {
  it("세 화면 모두 목적·사용법·답하는 것·답하지 않는 것이 있다", () => {
    for (const [surface, g] of Object.entries(CHATBOT_GUIDE)) {
      expect(g.purpose, surface).not.toHaveLength(0);
      expect(g.howTo.length, surface).toBeGreaterThan(0);
      expect(g.answers.length, surface).toBeGreaterThan(0);
      expect(g.declines.length, surface).toBeGreaterThan(0);
    }
  });

  it("‘답하지 않는다’고 적은 것은 안내층이 실제로 문의처로 보낸다", () => {
    // 적어만 두고 코드가 답해 버리면 설명이 거짓이 된다
    expect(detectGuide("상속세는 얼마나 나오나요?")?.topic).toBe("TAX");
    expect(detectGuide("이혼 재산분할은 어떻게 되나요?")?.topic).toBe("LEGAL_OTHER");
  });

  it("‘답한다’고 적은 것은 안내층이 실제로 답한다", () => {
    expect(detectGuide("유언장은 어떻게 쓰나요?")).not.toBeNull();
    expect(detectGuide("떠난 뒤에 기부하려면 어떤 서류를 써야 하나요?")?.suggestedDoc).toBe(
      "LEGACY_GIFT_AGREEMENT",
    );
    expect(detectGuide("나중에 취소할 수 있나요?", "LEGACY_GIFT_AGREEMENT")?.topic).toBe(
      "DOC_REVOKE",
    );
  });

  it("설명에 법률 수치를 적지 않는다 (P3)", () => {
    // 수치는 lib/rules의 몫이다. 화면 설명에 베껴 두면 개정 때 갈라진다
    for (const g of Object.values(CHATBOT_GUIDE)) {
      const all = [g.purpose, ...g.howTo, ...g.answers, ...g.declines].join(" ");
      expect(all).not.toMatch(/\d+\s*%|[0-9,]{4,}\s*원|\d+\s*개?월\s*이내/);
    }
  });
});
