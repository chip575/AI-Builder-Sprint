// 안내 층 테스트 — 잡아야 할 발화와 **넘겨야 할 발화**를 쌍으로 잰다 (AGENTS.md 테스트 절).
// 넘겨야 할 쪽이 더 중요하다: 의사 표현을 안내가 삼키면 가지 제안(FR-115A)이 죽는다.
import { describe, expect, it } from "vitest";
import { RENUNCIATION_PERIOD } from "../../rules/inheritance";
import { detectExpress } from "../../rules/express-detect";
import { detectGuide } from "./guide";

describe("detectGuide — 잡아야 할 질문형", () => {
  it("유언 질문 → 전자서명 불가 + §1066 + 필사 안내", () => {
    const g = detectGuide("유언장은 어떻게 남기나요?");
    expect(g?.topic).toBe("WILL");
    expect(g?.reply).toContain("전자서명으로 만들 수 없습니다");
    expect(g?.reply).toContain("민법 §1066");
    expect(g?.reply).toContain("필사 가이드");
  });

  it("유산기부 질문 → 사인증여 + 유류분 고지 (§562 · §1112)", () => {
    const g = detectGuide("제가 떠난 뒤에 기부는 어떻게 되나요?");
    expect(g?.topic).toBe("LEGACY_GIFT");
    expect(g?.reply).toContain("사인증여");
    expect(g?.reply).toContain("민법 §562");
    expect(g?.reply).toContain("유류분");
  });

  it("기한 질문 → 수치는 rules에서만 나온다 (P3)", () => {
    const g = detectGuide("상속 포기는 언제까지 할 수 있나요?");
    expect(g?.topic).toBe("DEADLINE");
    // 기간 수치가 이 모듈이 아니라 lib/rules 상수에서 왔음을 값으로 확인한다
    expect(g?.reply).toContain(`${RENUNCIATION_PERIOD.months}개월`);
    expect(g?.reply).toContain(RENUNCIATION_PERIOD.statute);
    // 기산점을 모르므로 날짜를 계산해 주지 않는다는 고지 (inheritance.ts 제약 [1])
    expect(g?.reply).toContain("계산해 드리지 않습니다");
  });

  it("상속 일반 질문 → 정성 안내 + 전문가 상담 (수치 없음)", () => {
    const g = detectGuide("상속은 어떻게 되나요?");
    expect(g?.topic).toBe("INHERITANCE");
    expect(g?.reply).toContain("전문가와 상담");
    // 유류분 비율 같은 미등재 수치를 지어내지 않는다 — rules에 없는 숫자는 문장에도 없다
    expect(g?.reply).not.toMatch(/절반|2분의|3분의|[0-9]+%/);
  });

  it("모든 안내에 근거의 확인일자가 붙는다 (P3) · 재촉 표현이 없다 (P4)", () => {
    const asks = [
      "유언장은 어떻게 남기나요?",
      "제가 떠난 뒤에 기부는 어떻게 되나요?",
      "상속 포기는 언제까지 할 수 있나요?",
      "상속은 어떻게 되나요?",
      "기부는 어떻게 하나요?",
    ];
    for (const ask of asks) {
      const g = detectGuide(ask);
      expect(g, ask).not.toBeNull();
      // P4 — 다크패턴 금지 문구는 헌법이 예시한 세 가지 그대로
      expect(g!.reply, ask).not.toMatch(/지금 |빨리|놓치기 전에/);
      // P3 — 조문을 인용했다면 확인일자도 함께
      if (g!.statutes.length > 0) {
        for (const s of g!.statutes) expect(s.verifiedAt, ask).toBeTruthy();
      }
    }
  });
});

describe("detectGuide — 넘겨야 할 발화 (안내가 삼키면 안 된다)", () => {
  it("의사 표현은 express-detect의 영역이다", () => {
    // 안내가 null이어야 라우트가 EXPRESS → 가지 제안으로 진행한다
    expect(detectGuide("부산에 기부하고 싶어요")).toBeNull();
    expect(detectExpress("부산에 기부하고 싶어요").kind).toBe("EXPRESS");
    expect(detectGuide("유언장을 준비하고 싶어요")).toBeNull();
    expect(detectExpress("유언장을 준비하고 싶어요").kind).toBe("EXPRESS");
  });

  it("회상 발화·잡담은 축 대화로 흘러간다", () => {
    expect(detectGuide("어릴 때 부산에서 자랐어요")).toBeNull();
    expect(detectGuide("요즘 마음이 복잡해요")).toBeNull();
    expect(detectGuide("")).toBeNull();
  });

  it("질문형이어도 유산 주제가 아니면 안내하지 않는다", () => {
    expect(detectGuide("오늘 날씨는 어떤가요?")).toBeNull();
  });
});
