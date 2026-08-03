// 추천 질문 — 화면이 "이건 답해 드립니다"라고 약속하는 목록 (FR-101)
//
// **손으로 예시를 박아두지 않는다.** 박아두면 주제 규칙(guide.ts TOPIC_RULES)이 바뀔 때
// 목록이 거짓말을 한다 — 눌렀는데 "그건 못 답합니다"가 나오는 순간 신뢰가 끝난다.
// 그래서 여기 있는 문장은 전부 `detectGuide`가 답한다는 것을 테스트가 고정한다.
//
// 왜 검색이 아니라 목록인가: 코퍼스가 없다. 아무것도 못 찾는 검색창은 없는 것보다
// 나쁘다 — 공백을 광고한다. 그리고 이 서비스가 **무엇을 답하는지**를 알리는 것이
// 지금 사용자가 겪는 문제(경계를 모른 채 던지는 물음)의 실제 원인이다.
//
// ⚠ 여기 문장을 고치면 반드시 `detectGuide`가 여전히 답하는지 확인한다 (suggested.test).
import type { GuideTopic } from "./guide";

export interface Suggestion {
  /** 눌렀을 때 그대로 전송되는 문장 */
  text: string;
  /** 이 문장이 걸려야 하는 주제 — 규칙이 바뀌면 테스트가 먼저 깨진다 */
  expects: GuideTopic;
}

/**
 * 순서는 **사용자가 먼저 부딪히는 것**부터다.
 * 유언(전자서명 불가)이 맨 앞인 이유: 이 서비스에서 가장 자주 어긋나는 기대이고,
 * 늦게 알수록 손해가 크다. 세금은 "답하지 않는다"를 미리 알리는 자리라 함께 둔다.
 */
export const SUGGESTIONS: Suggestion[] = [
  { text: "유언장은 어떻게 남기나요?", expects: "WILL" },
  { text: "떠난 뒤에 기부하려면 어떻게 하나요?", expects: "LEGACY_GIFT" },
  { text: "상속 포기는 언제까지 할 수 있나요?", expects: "DEADLINE" },
  { text: "상속은 어떻게 되나요?", expects: "INHERITANCE" },
  { text: "기부하면 공제는 어떻게 되나요?", expects: "DONATION" },
  { text: "상속세는 얼마나 나오나요?", expects: "TAX" },
];

/** 화면에 내보낼 문장만 */
export function suggestionTexts(): string[] {
  return SUGGESTIONS.map((s) => s.text);
}
