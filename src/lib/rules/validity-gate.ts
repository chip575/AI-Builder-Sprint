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
    // ⚠ 형제자매 유류분(제4호)은 **효력을 잃었다** — 헌재 2024. 4. 25. 2020헌가4 전원일치
    //   단순위헌. 종전 서술("상속인에게는")은 이 결정 이전 상태였다.
    //   미혼·무자녀인 분이 재산을 공익에 남길 때 형제자매의 반환 청구 위험이 사라진 것이라
    //   **사용자에게 유리한 변화**다. 빼면 없는 위험을 경고하게 된다.
    // ⚠ 금액은 여기서도 화면에서도 계산하지 않는다 — 상속인 확정·기초재산 산정·기여분이
    //   전부 사후에 법원에서 다투는 것이고, §1112 제1~3호는 개정 경과가 진행 중이다.
    summary:
      "직계비속·배우자·직계존속에게는 법정 유류분이 보장되어, 사인증여로 남기신 몫이 " +
      "조정될 수 있다. 형제자매의 유류분은 헌법재판소 2024. 4. 25. 2020헌가4 결정으로 " +
      "효력을 잃었다. 구체적인 금액은 사정에 따라 달라 여기서 계산하지 않는다.",
    verifiedAt: VERIFIED,
  },
  CIVIL_1108: {
    id: "민법 §1108①",
    title: "유언의 철회",
    // 조문 제목은 "유증의 철회"가 아니라 **"유언의 철회"** 다 (2026-08-03 조문 확인).
    // 대법원 2022. 7. 28. 2017다245330 — 사인증여는 증여자 사망으로 효력이 생기는
    // 무상행위로 실제 기능이 유증과 다르지 않으므로 최종 의사를 존중할 필요가 있다며
    // 준용을 인정했다. 종전 학계 다수설(계약이라 철회 불가)을 뒤집은 첫 명시적 판결이다.
    summary:
      "유언자는 언제든지 유언 또는 생전행위로써 유언을 철회할 수 있다. " +
      "대법원은 이 규정이 사인증여에도 준용된다고 보았다(2022. 7. 28. 선고 2017다245330).",
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
    // §1108①이 빠져 있으면 "한 번 서명하면 끝"으로 읽힌다. 철회권은 이 서류의
    // 성질이라 근거에 함께 실어야 한다 (legal-basis §1 표 "단서 필수")
    statutes: [STATUTES.CIVIL_562, STATUTES.CIVIL_1108, STATUTES.CIVIL_1112],
  },
  // 철회 통지서 — 전자서명 자체는 유효하다. 다만 **서명이 철회의 효력 요건은 아니다**:
  // 게이트는 "이 서명이 유효한가"를 판정하지 "이 서명이 필수인가"를 판정하지 않는다.
  // 그 구분은 서식 제2조가 본문에서 말한다
  REVOCATION_NOTICE: { verdict: "ESIGN_OK", statutes: [STATUTES.CIVIL_1108] },
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
