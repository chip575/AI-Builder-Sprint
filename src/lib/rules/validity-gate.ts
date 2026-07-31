// M-GATE — 법적 유효성 게이트 (FR-104 · spec/00.1-rules.md §4)
//
// 이 프로젝트의 핵심 자산. 순수 함수 · LLM 비의존 (환각 차단, ADR-2).
// UI가 아니라 서버가 여기서 차단한다 — 버튼 숨김은 눈속임이다.
// ⚠ human_review: required — 에이전트 단독 변경 금지 (AGENTS.md 보안 5조).
import type { DocType } from "../contracts/common";
import type { GateVerdict, Statute } from "../contracts/gate";

const VERIFIED = "2026-07-28";

/** 법령·판례 원장 — 판정 결과에 그대로 실려 UI에 노출된다 (P3) */
export const STATUTES = {
  CIVIL_1060: {
    id: "민법 §1060",
    title: "유언의 요식성",
    summary: "유언은 본법에 정한 방식에 의하지 아니하면 효력이 생기지 아니한다.",
    verifiedAt: VERIFIED,
  },
  CIVIL_1065: {
    id: "민법 §1065",
    title: "유언의 보통방식",
    summary: "유언 방식은 자필증서·녹음·공정증서·비밀증서·구수증서의 5종으로 한정된다.",
    verifiedAt: VERIFIED,
  },
  CIVIL_1066: {
    id: "민법 §1066",
    title: "자필증서 유언",
    summary: "자필증서 유언은 전문·연월일·주소·성명을 자서하고 날인하여야 한다.",
    verifiedAt: VERIFIED,
  },
  SCC_2006DA25103: {
    id: "대법원 2006다25103·25110",
    title: "날인 없는 유언장 무효",
    summary: "날인 없는 유언장은 자필증서 유언으로서 무효다 (2006. 9. 8. 선고).",
    verifiedAt: VERIFIED,
  },
  SCC_2014_ADDRESS: {
    id: "대법원 2014. 10. 6. 선고",
    title: "주소 미자서 무효",
    summary: "주소를 자서하지 않으면 유언자 특정에 지장이 없어도 무효다.",
    verifiedAt: VERIFIED,
  },
  CIVIL_562: {
    id: "민법 §562",
    title: "사인증여",
    summary: "증여자의 사망으로 효력이 생기는 증여는 유증에 관한 규정을 준용한다.",
    verifiedAt: VERIFIED,
  },
  CIVIL_1112: {
    id: "민법 §1112",
    title: "유류분",
    summary: "상속인에게는 법정 유류분이 보장된다. 사인증여는 유류분을 침해할 수 있다.",
    verifiedAt: VERIFIED,
  },
  PRIVACY_22: {
    id: "개인정보보호법 §22",
    title: "동의를 받는 방법",
    summary: "개인정보 처리 동의는 전자적 방식으로 받을 수 있다.",
    verifiedAt: VERIFIED,
  },
} satisfies Record<string, Statute>;

/** 문서 유형 → 판정 테이블 (00.1 §4 표를 그대로 코드화) */
const GATE_TABLE: Record<DocType, GateVerdict> = {
  DONATION_PLEDGE: { verdict: "ESIGN_OK", statutes: [] },
  RECURRING_CONSENT: { verdict: "ESIGN_OK", statutes: [] },
  PRIVACY_TAX_CONSENT: { verdict: "ESIGN_OK", statutes: [STATUTES.PRIVACY_22] },
  VOLUNTEER_PLEDGE: { verdict: "ESIGN_OK", statutes: [] },
  HERITAGE_SUPPORT_PLEDGE: { verdict: "ESIGN_OK", statutes: [] },
  // 사인증여 — 유효하되 유류분 고지 필수 (00.2 §7.2)
  LEGACY_GIFT_AGREEMENT: {
    verdict: "ESIGN_OK",
    statutes: [STATUTES.CIVIL_562, STATUTES.CIVIL_1112],
  },
  // Custodian ≠ 유언집행자 — 약정서 본문 고지는 템플릿 소관 (00.2 §7.1)
  CUSTODIAN_AGREEMENT: { verdict: "ESIGN_OK", statutes: [] },
  // 서명 없이 보관되는 문서다 (FR-403). 서명 버튼이 붙을 자리가 없어야 한다
  DIGITAL_LEGACY_INSTRUCTION: { verdict: "NON_BINDING", statutes: [] },
  // 의사 확인서 — 사실확인 문서, 유언 전문 미포함 (FR-551)
  INTENT_AFFIRMATION: { verdict: "ESIGN_OK", statutes: [] },
  // 유언장 — 전자서명 무효. 자필 필사 가이드로 라우팅 (FR-302)
  HANDWRITTEN_WILL: {
    verdict: "ESIGN_INVALID",
    statutes: [
      STATUTES.CIVIL_1060,
      STATUTES.CIVIL_1065,
      STATUTES.CIVIL_1066,
      STATUTES.SCC_2006DA25103,
      STATUTES.SCC_2014_ADDRESS,
    ],
    alternativeRoute: "HANDWRITING_GUIDE",
  },
  // 마음의 편지 — 효력 없음이 의도된 문서. 서명 없이 보관 (FR-303)
  HEART_LETTER: { verdict: "NON_BINDING", statutes: [] },
};

/**
 * 게이트 판정 (FR-104). 모든 문서 생성·서명 요청은 이 함수를 통과해야 한다.
 * ESIGN_INVALID면 어떤 경로로든 서명 API는 서버에서 차단된다 (UI 우회 불가).
 */
export function evaluateGate(docType: DocType): GateVerdict {
  return GATE_TABLE[docType];
}

/** 서명 요청 직전 방어선 — ESIGN_OK가 아니면 서명 요청 자체가 불가 */
export function canRequestSignature(docType: DocType): boolean {
  return evaluateGate(docType).verdict === "ESIGN_OK";
}
