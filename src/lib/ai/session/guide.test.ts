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

  it("세금 질문 → 계산하지 않고 문의처로 보낸다", () => {
    // 그럴듯한 세액은 침묵보다 나쁘다 — 사용자가 그 숫자를 기준으로 결정한다
    const g = detectGuide("상속세는 얼마나 나오나요?");
    expect(g?.topic).toBe("TAX");
    expect(g?.reply).toContain("계산해 드리지 않습니다");
    expect(g?.reply).toContain("국세상담센터");
    expect(g?.reply).toContain("126");
    // 근거 조문을 붙이지 않는다 — 근거가 달리면 답처럼 읽힌다
    expect(g?.statutes).toHaveLength(0);
    expect(g?.reply).not.toMatch(/[0-9]+%|[0-9,]{4,}원/);
  });

  it("세금 질문이 기한 안내를 가로채지 않는다 — 순서 검사", () => {
    // "상속세 신고 기한"이 DEADLINE에 걸리면 묻지도 않은 상속 포기 기간을 답한다
    expect(detectGuide("상속세 신고 기한이 언제까지인가요?")?.topic).toBe("TAX");
    // 그러면서 진짜 기한 질문은 여전히 DEADLINE이어야 한다 — 통과 케이스
    expect(detectGuide("상속 포기는 언제까지 할 수 있나요?")?.topic).toBe("DEADLINE");
  });

  it("우리 서식의 기부 공제는 문의처로 보내지 않는다 — 그건 우리 일이다", () => {
    // "공제"를 세법 패턴에 넣으면 기부 대화가 통째로 "문의하세요"로 끝난다
    const g = detectGuide("기부하면 공제는 어떻게 되나요?");
    expect(g?.topic).toBe("DONATION");
    expect(g?.reply).not.toContain("국세상담센터");
  });

  it("법률 판단 안내는 갈 곳을 함께 준다 — 거절만 남기지 않는다", () => {
    for (const ask of ["상속은 어떻게 되나요?", "상속 포기는 언제까지 할 수 있나요?"]) {
      const g = detectGuide(ask);
      expect(g?.reply, ask).toContain("대한법률구조공단");
      expect(g?.reply, ask).toContain("132");
    }
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

describe("실사용에서 새어 나갔던 말들 (2026-08-03)", () => {
  // 쌍으로 잰다 — 잡아야 할 것과 **잡으면 안 되는 것**을 함께 본다 (AGENTS.md 테스트 절)
  it("물음표 없는 세금 질문을 세법 안내가 받는다", () => {
    // 이게 null이라 LLM으로 넘어갔고, 모델은 회상 질문으로 답했다
    expect(detectGuide("기부금에 따른 세금 계산을 하고 싶은데")?.topic).toBe("TAX");
    expect(detectGuide("상속세가 얼마나 나올지 알고 싶은데")?.topic).toBe("TAX");
  });

  it("세법 안내는 답을 만들지 않고 문의처로 보낸다", () => {
    const reply = detectGuide("세금 계산을 하고 싶은데")!.reply;
    expect(reply).toContain("계산해 드리지 않습니다");
    expect(reply).toMatch(/126|국세/); // 문의처가 실제로 실려 나간다
    expect(reply).not.toMatch(/\d+\s*%/); // 세율을 흘리지 않는다 (P3)
  });

  it("의사 표현은 여전히 안내가 가져가지 않는다 — 가지 몫이다", () => {
    // 질문형을 넓히면서 여기까지 삼키면 작성실 진입 발화가 안내로 끝난다
    expect(detectGuide("고향에 기부하고 싶어요")).toBeNull();
    expect(detectGuide("유산 기부를 하고 싶어요")).toBeNull();
    expect(detectGuide("문화유산을 후원하고 싶어요")).toBeNull();
  });
});

describe("범위 밖 법률 질문 — 못 들은 척하지 않는다 (2026-08-03)", () => {
  it("우리 서류와 무관한 법률 질문은 문의처로 보낸다", () => {
    // 없을 때는 회상 질문("가장 고마운 사람은?")이 돌아왔다
    expect(detectGuide("이혼 재산분할은 어떻게 되나요?")?.topic).toBe("LEGAL_OTHER");
    expect(detectGuide("빚이 있으면 어떻게 되는지 알고 싶은데")?.topic).toBe("LEGAL_OTHER");
    const reply = detectGuide("이혼 재산분할은 어떻게 되나요?")!.reply;
    expect(reply).toContain("범위를 넘습니다");
    expect(reply).toMatch(/132|법률구조/);
  });

  it("우리 주제를 이 그물이 가로채지 않는다 — 순서가 규칙이다", () => {
    expect(detectGuide("유언장은 어떻게 쓰나요?")?.topic).toBe("WILL");
    expect(detectGuide("상속세는 얼마나 나오나요?")?.topic).toBe("TAX");
    expect(detectGuide("상속 포기는 언제까지 하나요?")?.topic).toBe("DEADLINE");
    expect(detectGuide("기부는 어떻게 하나요?")?.topic).toBe("DONATION");
  });
});
