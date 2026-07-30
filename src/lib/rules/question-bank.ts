// human_review: 2026-07-31 PM 승인 — 법률 수치 없음(회상 질문 문장·축 이름만).
// lib/rules 경로인 이유: 질문은 LLM이 짓지 않는 상수이고 커버리지 판정이 결정론적이어야 하기 때문.
// M-QUESTION-BANK — 5축 20문항 + 커버리지 엔진 (FR-301 · FR-110)
//
// 질문 본문과 축 이름의 **유일한 진실**이 이 파일이다. LLM이 질문을 지어내지 않는다 —
// 회상 인터뷰는 매번 같은 질문을 같은 순서 힌트로 제공해야 재현 가능하고,
// "AI가 오늘은 다른 걸 물어보네"가 되면 사용자가 이야기를 이어갈 수 없다.
//
// 수락 기준(FR-301)이 이 모듈의 형태를 결정했다:
//  · 축의 첫 질문은 재산·금액 질문이 아니다 → 질문 본문에 금액 어휘를 넣지 않는다
//  · 건너뛰면 재질문하지 않는다          → nextQuestion이 skipped를 영구 제외한다
//  · 감정 반응에 재촉하지 않는다          → needsPause가 다음 질문 대신 머무름을 택하게 한다
import type { AxisCoverage } from "../contracts/session";
import type { Question } from "../contracts/question-bank";

export const AXES = [
  { id: "LIFE", label: "살아온 이야기" },
  { id: "VALUES", label: "가치" },
  { id: "RELATIONS", label: "관계" },
  { id: "LEGACY", label: "남기고 싶은 것" },
  { id: "WISHES", label: "당부" },
] as const;

export type AxisId = (typeof AXES)[number]["id"];

/** 질문 하나 + 그 질문이 "다뤄졌다"고 볼 어휘.
 *  키워드는 계약(Question)에 없다 — 응답으로 나가지 않고 커버리지 판정에만 쓴다. */
interface BankEntry extends Question {
  axis: AxisId;
  keywords: string[];
}

/** 20문항 · 축당 4문항 (FR-301 "각 축 3~5문항, 총 20문항 내외").
 *  order는 정렬 힌트일 뿐이다 — 순서 이탈이 허용된다 (FR-110). */
export const QUESTIONS: BankEntry[] = [
  // ── 살아온 이야기 ──
  { id: "LIFE-1", axis: "LIFE", order: 0, text: "지금까지 살아오시면서 가장 잘했다고 생각하는 결정은 무엇인가요?",
    keywords: ["결정", "선택", "잘했", "후회", "돌이켜"] },
  { id: "LIFE-2", axis: "LIFE", order: 1, text: "떠올리면 지금도 마음이 따뜻해지는 순간이 있으신가요?",
    keywords: ["순간", "따뜻", "행복", "기억", "추억"] },
  { id: "LIFE-3", axis: "LIFE", order: 2, text: "가장 고마운 사람을 한 분 떠올린다면 누구인가요?",
    keywords: ["고마", "감사", "은혜", "덕분"] },
  { id: "LIFE-4", axis: "LIFE", order: 3, text: "스스로 자랑스럽게 여기는 일이 있다면 들려주시겠어요?",
    keywords: ["자랑", "뿌듯", "이뤄", "해냈"] },

  // ── 가치 ──
  { id: "VALUES-1", axis: "VALUES", order: 4, text: "살아오시며 돈보다 중요하게 여기신 것은 무엇이었나요?",
    keywords: ["중요", "가치", "신념", "원칙", "믿"] },
  { id: "VALUES-2", axis: "VALUES", order: 5, text: "다음 세대에 이어졌으면 하는 마음이나 태도가 있으신가요?",
    keywords: ["이어", "물려", "다음 세대", "후대", "자녀", "아이들"] },
  { id: "VALUES-3", axis: "VALUES", order: 6, text: "어떤 사람으로 기억되고 싶으세요?",
    keywords: ["기억되", "사람으로", "이미지", "평가"] },
  { id: "VALUES-4", axis: "VALUES", order: 7, text: "지키려고 애쓰셨던 약속이나 원칙이 있다면요?",
    keywords: ["약속", "원칙", "지키", "애썼"] },

  // ── 관계 ──
  { id: "RELATIONS-1", axis: "RELATIONS", order: 8, text: "꼭 전하고 싶은 말이 있는 분이 계신가요?",
    keywords: ["전하고", "말하고", "하고 싶은 말"] },
  { id: "RELATIONS-2", axis: "RELATIONS", order: 9, text: "아직 못 한 말이 남아 있다면 어떤 말인가요?",
    keywords: ["못 한 말", "못한 말", "미안", "사과", "용서"] },
  { id: "RELATIONS-3", axis: "RELATIONS", order: 10, text: "요즘 마음에 자주 머무는 사람이 있으신가요?",
    keywords: ["가족", "아내", "남편", "아들", "딸", "친구", "부모", "어머니", "아버지"] },
  { id: "RELATIONS-4", axis: "RELATIONS", order: 11, text: "함께한 시간 중 다시 살아보고 싶은 날이 있다면 언제인가요?",
    keywords: ["함께", "그때", "다시", "그 시절"] },

  // ── 남기고 싶은 것 ──
  { id: "LEGACY-1", axis: "LEGACY", order: 12, text: "오래 간직해 오신 물건 중 이야기가 담긴 것이 있나요?",
    keywords: ["물건", "간직", "사진", "편지", "반지", "시계"] },
  { id: "LEGACY-2", axis: "LEGACY", order: 13, text: "그 물건이 누구에게 가면 좋겠다고 생각하신 적 있으세요?",
    keywords: ["주고 싶", "물려", "남기고", "가면 좋"] },
  { id: "LEGACY-3", axis: "LEGACY", order: 14, text: "마음이 가는 일이나 단체가 있으신가요?",
    keywords: ["기부", "단체", "후원", "돕", "나눔", "봉사"] },
  { id: "LEGACY-4", axis: "LEGACY", order: 15, text: "고향이나 오래 지낸 곳에 대한 마음은 어떠신가요?",
    keywords: ["고향", "지역", "동네", "부산", "마을", "살던 곳"] },

  // ── 당부 ──
  { id: "WISHES-1", axis: "WISHES", order: 16, text: "남은 분들이 어떻게 지내면 좋겠다고 바라시나요?",
    keywords: ["지내", "바라", "잘 살", "행복하게"] },
  { id: "WISHES-2", axis: "WISHES", order: 17, text: "제 걱정은 하지 말라고 전하고 싶은 것이 있으신가요?",
    keywords: ["걱정", "슬퍼", "울지", "괜찮"] },
  { id: "WISHES-3", axis: "WISHES", order: 18, text: "당신을 떠올릴 때 어떤 장면이었으면 하세요?",
    keywords: ["떠올", "장면", "모습"] },
  { id: "WISHES-4", axis: "WISHES", order: 19, text: "마지막으로 남기고 싶은 한 문장이 있다면요?",
    keywords: ["마지막", "한 문장", "남기고 싶"] },
];

/** 계약(QuestionBank) 모양으로 — keywords는 나가지 않는다 */
export function questionBank() {
  return {
    axes: AXES.map((a) => ({ id: a.id, label: a.label })),
    questions: QUESTIONS.map(({ id, axis, text, order }) => ({ id, axis, text, order })),
  };
}

/** 어느 축이 얼마나 다뤄졌나. 질문을 던졌는지가 아니라 **사용자가 말했는지**로 센다 —
 *  질문 순서를 벗어나 스스로 꺼낸 이야기도 커버리지에 잡혀야 한다 (FR-110 순서 이탈 허용). */
export function computeCoverage(utterances: string[]): AxisCoverage {
  const said = utterances.join(" ");
  return AXES.map((axis) => {
    const qs = QUESTIONS.filter((q) => q.axis === axis.id);
    return {
      axis: axis.id,
      answered: qs.filter((q) => q.keywords.some((k) => said.includes(k))).length,
      total: qs.length,
    };
  });
}

/**
 * 다음에 던질 질문. 이미 답한 축은 뒤로 미뤄 한 축만 파고들지 않게 한다.
 * skipped는 영구 제외다 — 건너뛴 질문을 다시 묻지 않는다 (FR-301 수락 기준).
 */
export function nextQuestion(input: {
  utterances: string[];
  askedIds: string[];
  skippedIds: string[];
}): Question | null {
  const coverage = computeCoverage(input.utterances);
  const answeredByAxis = new Map(coverage.map((c) => [c.axis, c.answered]));
  const excluded = new Set([...input.askedIds, ...input.skippedIds]);

  const candidates = QUESTIONS.filter((q) => !excluded.has(q.id));
  if (candidates.length === 0) return null;

  // 덜 다뤄진 축 우선, 같으면 order 순 — 결정론적이어야 재현 가능한 데모가 된다
  const best = candidates.sort(
    (a, b) =>
      (answeredByAxis.get(a.axis) ?? 0) - (answeredByAxis.get(b.axis) ?? 0) ||
      a.order - b.order,
  )[0]!;
  const { id, axis, text, order } = best;
  return { id, axis, text, order };
}

/** 상실·죽음에 대한 감정 반응. 다음 질문으로 재촉하지 않고 머무를 선택지를 준다 (FR-301) */
const GRIEF_MARKERS = [
  "눈물", "울었", "울고", "보고 싶", "그립", "힘들", "무섭", "두렵",
  "외롭", "미치겠", "못 견디", "슬프", "슬퍼",
];

export function needsPause(text: string): boolean {
  return GRIEF_MARKERS.some((m) => text.includes(m));
}

/** 머무름 화면 문구 — 다음 질문을 밀어내는 자리이므로 여기서 문장을 고정한다 */
export const PAUSE_PROMPT = {
  message: "잠시 여기 머물러도 괜찮습니다. 서두르지 않으셔도 됩니다.",
  choices: [
    { id: "STAY", label: "조금 더 이야기할게요" },
    { id: "NEXT", label: "다음 질문으로 갈게요" },
    { id: "REST", label: "오늘은 여기까지 할게요" },
  ],
} as const;
