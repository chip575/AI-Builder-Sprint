// M-QUESTION-BANK 테스트 (FR-301 · FR-110)
// 수락 기준 세 줄이 곧 테스트 세 묶음이다. 질문 문장 자체가 산출물이므로
// "재산 질문이 아니다"·"재촉하지 않는다"를 문장 검사로 고정한다.
import { describe, expect, it } from "vitest";
import {
  AXES,
  computeCoverage,
  needsPause,
  nextQuestion,
  PAUSE_PROMPT,
  questionBank,
  QUESTIONS,
} from "./question-bank";
import { QuestionBank } from "@/lib/contracts";

describe("M-QUESTION-BANK — 구성 (FR-301)", () => {
  it("5축 20문항이고 축마다 3~5문항이다", () => {
    expect(AXES).toHaveLength(5);
    expect(QUESTIONS).toHaveLength(20);
    for (const axis of AXES) {
      const n = QUESTIONS.filter((q) => q.axis === axis.id).length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it("계약(QuestionBank) 모양으로 나가고 키워드는 새지 않는다", () => {
    const bank = QuestionBank.parse(questionBank());
    expect(bank.questions).toHaveLength(20);
    // 커버리지 판정용 어휘는 내부 구현이다 — 응답에 실리면 정답을 알려주는 꼴이 된다
    expect(JSON.stringify(bank)).not.toContain("keywords");
  });

  it("질문 id가 중복되지 않는다", () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(20);
  });
});

describe("M-QUESTION-BANK — 첫 질문은 재산 질문이 아니다 (수락 기준 1)", () => {
  it("모든 질문 문장에 금액·재산 어휘가 없다", () => {
    // 회상은 재산 목록이 아니라 삶의 이야기로 시작한다 (FR-301)
    const banned = ["금액", "얼마", "재산", "자산", "계좌", "예금", "부동산", "상속세"];
    for (const q of QUESTIONS) {
      for (const w of banned) {
        expect(`${q.id}: ${q.text}`).not.toContain(w);
      }
    }
  });

  it("각 축의 첫 질문(order 최소)이 이야기로 여는 문장이다", () => {
    for (const axis of AXES) {
      const first = QUESTIONS.filter((q) => q.axis === axis.id).sort(
        (a, b) => a.order - b.order,
      )[0]!;
      expect(first.text).toMatch(/\?$/); // 지시가 아니라 질문
      expect(first.text.length).toBeGreaterThan(10);
    }
  });
});

describe("M-QUESTION-BANK — 건너뛰면 재질문하지 않는다 (수락 기준 2)", () => {
  const empty = { utterances: [], askedIds: [], skippedIds: [] };

  it("건너뛴 질문은 다시 나오지 않는다", () => {
    const first = nextQuestion(empty)!;
    const second = nextQuestion({ ...empty, skippedIds: [first.id] })!;
    expect(second.id).not.toBe(first.id);

    // 남은 19문항을 모두 소진해도 건너뛴 것은 끝내 나오지 않는다
    const seen: string[] = [];
    let cur = nextQuestion({ ...empty, skippedIds: [first.id] });
    while (cur) {
      seen.push(cur.id);
      cur = nextQuestion({ ...empty, skippedIds: [first.id], askedIds: seen });
    }
    expect(seen).toHaveLength(19);
    expect(seen).not.toContain(first.id);
  });

  it("모두 소진하면 null — 질문을 지어내지 않는다", () => {
    expect(nextQuestion({ ...empty, askedIds: QUESTIONS.map((q) => q.id) })).toBeNull();
  });

  it("같은 입력에 같은 질문 — 결정론적이다", () => {
    expect(nextQuestion(empty)!.id).toBe(nextQuestion(empty)!.id);
  });
});

describe("M-QUESTION-BANK — 커버리지 (FR-110 순서 이탈 허용)", () => {
  it("질문을 던지지 않아도 사용자가 말했으면 잡힌다", () => {
    // 질문 순서를 무시하고 스스로 꺼낸 이야기 — 이것이 세지지 않으면
    // "순서를 지켜야 진도가 나간다"가 되어 FR-110과 어긋난다
    const cov = computeCoverage(["아내한테 아직 못 한 말이 있어요"]);
    const relations = cov.find((c) => c.axis === "RELATIONS")!;
    expect(relations.answered).toBeGreaterThan(0);
    expect(relations.total).toBe(4);
  });

  it("아무 말도 없으면 전 축 0", () => {
    for (const c of computeCoverage([])) expect(c.answered).toBe(0);
  });

  it("덜 다뤄진 축을 먼저 묻는다 — 한 축만 파고들지 않는다", () => {
    const utterances = ["가족한테 미안하고 못 한 말이 많아요"]; // RELATIONS가 채워진 상태
    const q = nextQuestion({ utterances, askedIds: [], skippedIds: [] })!;
    expect(q.axis).not.toBe("RELATIONS");
  });
});

describe("M-QUESTION-BANK — 감정 반응에 재촉하지 않는다 (수락 기준 3)", () => {
  it("상실 표현을 감지한다", () => {
    expect(needsPause("자꾸 눈물이 나요")).toBe(true);
    expect(needsPause("그 사람이 너무 보고 싶어요")).toBe(true);
    expect(needsPause("부산에 기부하고 싶어요")).toBe(false);
  });

  it("머무름 문구에 재촉·긴급성 어휘가 없다 (NFR-708)", () => {
    const text = PAUSE_PROMPT.message + PAUSE_PROMPT.choices.map((c) => c.label).join(" ");
    for (const w of ["빨리", "서둘러", "지금 바로", "얼마 남지", "마감", "곧 종료"]) {
      expect(text).not.toContain(w);
    }
    expect(PAUSE_PROMPT.message).toContain("괜찮습니다");
  });

  it("머무름·다음·중단 세 갈래를 준다 — 다음으로만 몰지 않는다", () => {
    expect(PAUSE_PROMPT.choices.map((c) => c.id)).toEqual(["STAY", "NEXT", "REST"]);
  });
});
