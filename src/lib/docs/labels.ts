// 문서 표시명 — **화면과 서면이 같은 이름을 쓴다** (NFR-705)
//
// 왜 옮겼나: 이 표가 `/clm` 화면 안에만 있어서 서버가 쓸 수 없었다. 그 결과
// 철회 통지서의 "철회 대상 약정" 칸에 `LEGACY_GIFT_AGREEMENT`가 **그대로 인쇄**됐다.
// 사용자는 화면에서 "유산 기부 약정서"로 보던 것을 서면에서 코드값으로 만난다.
//
// ⚠ 코드값을 사용자에게 그대로 보여주지 않는다 (NFR-705). 새 DocType을 만들면
//   여기 행도 함께 만든다 — Record<DocType>이라 빠뜨리면 tsc가 잡는다.
import type { DocType } from "../contracts/common";

export const DOC_LABEL: Record<DocType, string> = {
  DONATION_PLEDGE: "기부 약정서",
  RECURRING_CONSENT: "정기후원 약정서",
  PRIVACY_TAX_CONSENT: "개인정보 동의서",
  VOLUNTEER_PLEDGE: "봉사 약정서",
  HERITAGE_SUPPORT_PLEDGE: "문화유산 후원 약정서",
  LEGACY_GIFT_AGREEMENT: "유산 기부 약정서",
  CUSTODIAN_AGREEMENT: "보관·집행 협조 약정서",
  INTENT_AFFIRMATION: "의사 확인서",
  HANDWRITTEN_WILL: "자필 유언",
  HEART_LETTER: "마음 편지",
  DIGITAL_LEGACY_INSTRUCTION: "디지털 유산 지시서",
  REVOCATION_NOTICE: "철회 통지서",
};

/** 모르는 값이 와도 화면이 죽지 않는다 — 서버가 준 문자열을 그대로 넘기는 자리가 있다 */
export function docLabel(docType: string): string {
  return DOC_LABEL[docType as DocType] ?? docType;
}

/**
 * 목적격 조사 — 받침이 있으면 "을", 없으면 "를".
 *
 * 서류 이름을 문장에 끼우면서 "를"로 고정했더니 **"자필 유언를 쓰시면 됩니다"**가
 * 나왔다 (2026-08-03 실측). 이름이 표에서 오는 이상 조사도 표에서 나와야 한다.
 */
export function objectParticle(word: string): string {
  const last = word.trim().at(-1);
  if (!last) return "를";
  const code = last.charCodeAt(0);
  // 한글 음절 영역이 아니면 판정하지 않는다 — 영문·숫자 이름은 "를"로 둔다
  if (code < 0xac00 || code > 0xd7a3) return "를";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

/** "자필 유언을" 처럼 이름과 조사를 붙여 준다 */
export function docLabelWithObject(docType: DocType): string {
  const label = DOC_LABEL[docType];
  return `${label}${objectParticle(label)}`;
}
