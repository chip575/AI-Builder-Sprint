// 신뢰도 산출 규칙 — 모델이 confidence를 주든 안 주든 이 3단계로 정규화한다.
// (Solar가 필드별 confidence를 반환하는지는 미확인. 반환하면 이 매핑만 바꾼다 — 인터페이스 불변)
//
// ⚠ 진짜 안전장치는 임계값이 아니다. 금액·수증자·기관명 같은 치명 필드는
//   confidence와 무관하게 항상 확인 화면(FactSheet)에서 사용자 확정을 거친다 (P1).
//   CONFIRM_THRESHOLD는 "그 화면에서 무엇을 강조하고 되물을까"를 정하는 값일 뿐이다.
//   — 발표 Q&A: "0.7의 근거는?" → 위 두 줄이 답이다.

export const CONFIDENCE = {
  /** 원문에 숫자·명칭이 명시됨 ("100만원", "부산") */
  HIGH: 0.95,
  /** 수량·어림 표현을 파싱함 ("한 십만원쯤") → 확인 화면에서 강조 */
  MEDIUM: 0.6,
  /** 문맥 추론 — 항상 되묻는다. 추측으로 채우지 않는다 (FR-102) */
  LOW: 0.3,
} as const;

/** 이 값 미만이면 확인 화면에서 강조 + 되묻기 대상 (FR-102 "신뢰도가 임계치 미만") */
export const CONFIRM_THRESHOLD = 0.7;

export function needsReask(confidence: number): boolean {
  return confidence < CONFIRM_THRESHOLD;
}
