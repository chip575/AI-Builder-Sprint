// 추천 질문은 **약속**이다. 눌렀는데 답을 못 하면 그 순간 신뢰가 끝난다.
// 그래서 이 파일의 핵심 검사는 하나다: 목록의 모든 문장을 안내층이 답한다.
import { describe, expect, it } from "vitest";
import { detectGuide } from "./guide";
import { SUGGESTIONS, suggestionTexts } from "./suggested";

describe("추천 질문은 전부 안내층이 답한다", () => {
  it.each(SUGGESTIONS)("$text → $expects", ({ text, expects }) => {
    const g = detectGuide(text);
    // null이면 LLM으로 넘어간다 — 추천해 놓고 즉흥 답변을 받게 하는 셈이다
    expect(g, text).not.toBeNull();
    // 주제까지 본다. 답하기는 하는데 **다른 주제로** 답하면 더 나쁘다 —
    // "상속세는?"에 상속 포기 기간이 나오는 식
    expect(g?.topic, text).toBe(expects);
  });

  it("문장이 비어 있거나 중복되지 않는다", () => {
    const texts = suggestionTexts();
    expect(new Set(texts).size).toBe(texts.length);
    for (const t of texts) expect(t.trim().length).toBeGreaterThan(0);
  });
});

describe("추천 질문 문구 규칙", () => {
  it("재촉하지 않는다 (P4)", () => {
    for (const t of suggestionTexts()) {
      expect(t, t).not.toMatch(/지금|빨리|놓치기 전에|서둘/);
    }
  });

  it("답을 미리 단정하지 않는다 — 물음이지 주장이 아니다", () => {
    // "유언장도 전자서명 됩니다"처럼 답을 담은 문장을 칩에 넣으면,
    // 사용자는 누르기도 전에 틀린 사실을 읽는다
    for (const t of suggestionTexts()) expect(t, t).toMatch(/[?？]$/);
  });

  it("법률 수치가 들어 있지 않다 (P3)", () => {
    for (const t of suggestionTexts()) {
      expect(t, t).not.toMatch(/\d+(\.\d+)?%|[\d,]{4,}\s*원|\d+\s*개월/);
    }
  });
});

describe("주제 커버리지", () => {
  it("안내층이 가진 주제를 빠짐없이 덮는다", () => {
    // 주제를 새로 만들고 추천에 안 넣으면 그 기능은 있어도 아무도 모른다.
    // 반대로 여기 없는 주제가 생기면 이 검사가 먼저 알려 준다
    const covered = new Set(SUGGESTIONS.map((s) => s.expects));
    for (const t of ["WILL", "LEGACY_GIFT", "DEADLINE", "INHERITANCE", "DONATION", "TAX"] as const) {
      expect(covered.has(t), t).toBe(true);
    }
  });
});
