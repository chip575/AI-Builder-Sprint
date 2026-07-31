// 모두싸인 템플릿 dataLabel ↔ 우리 필드 키 매핑
//
// 왜 이 파일이 있는가:
//   콘솔이 입력란마다 랜덤 dataLabel(45ca441f …)을 자동 생성했고, 그것을
//   우리 키로 일일이 바꾸는 대신 여기서 번역한다. 번역은 어댑터의 일이다.
//
// ⚠ 취약점: 템플릿을 다시 만들면 dataLabel이 새로 생성되어 이 표가 죽는다.
//   그때 증상은 **에러가 아니라 조용한 빈칸**이다 — 서면에 값이 빠진 채 서명된다.
//   `toDataLabel()`은 미등록 키를 던져 잡지만, **라벨이 바뀐 경우는 못 잡는다.**
//   그래서 배포·왕복 전에 `node scripts/verify-templates.mjs`로 실제 템플릿과 대조한다.
//
// v2 (2026-08-01): 기관·본인 날인란 제거 반영.
//   ①②④⑤의 "기관(사인·도장)"과 ⑧의 "본인(사인·도장)"을 콘솔에서 삭제했다.
//   서식 본문이 "기관은 기명날인을 하여"라고 정하고 있어 그 도장은
//   문서에 인쇄되는 부분이지 전자서명 참여자가 아니다. 남겨두면 서명자가
//   2명이 되어 서명 요청이 두 곳으로 가고 문서가 완료되지 않는다.

export const TEMPLATE_LABELS = {
  DONATION_PLEDGE: {
    donor_name:    "45ca441f", // 기부자 성명
    donor_contact: "cd8b32c8", // 기부자 연락처
    org_name:      "caba225d", // 기관 명칭
    org_rep:       "66d38c32", // 기관 대표자
    program_title: "035da8e8", // 기부 사업명
    amount_krw:    "2c101ae5", // 기부 금액
    donation_date: "c3160b0b", // 약정 체결일
    _signName:     "ac9780d1", // 성명란 · 기부자 (텍스트)
    _sign:         "9fcbffae", // 서명 · 기부자
  },

  RECURRING_CONSENT: {
    donor_name:         "abafe543", // 후원자 성명
    org_name:           "bd7a596d", // 기관 명칭
    org_rep:            "13e6a538", // 기관 대표자
    monthly_amount_krw: "c4b89e27", // 월 후원금액
    period_months:      "5cec5c0b", // 후원 기간(개월)
    total_amount_krw:   "7d967f0f", // 총 후원금액
    first_debit_date:   "2bdee9cd", // 최초 출금일
    _signName:          "261a7031",
    _sign:              "5f51dfeb",
    // ⚠ org_contact(제2조 해지 연락처)는 입력란이 없다.
    //    서식에 인쇄되어 있어야 하며, 비어 있으면 해지 방법 고지 요건이 약해진다.
  },

  PRIVACY_CONSENT: {
    subject_name:     "a78f390a", // 정보주체 성명
    org_name:         "96b25d01", // 개인정보처리자
    collect_items:    "63052cba", // 수집하는 항목
    purpose:          "a854d3a5", // 이용하는 목적
    retention_period: "4e388cdc", // 보유하는 기간
    _signName:        "259fd5b4",
    _sign:            "6c353e3c",
  },

  LEGACY_GIFT: {
    donor_name:          "b33856df", // 기부자 성명
    org_name:            "3a7d7439", // 수혜 기관명
    org_rep:             "835549f7", // 기관 대표자
    asset_summary:       "31c98bda", // 기부 대상 재산
    effective_condition: "61e57f05", // 효력이 발생하는 조건
    _signName:           "c9f61136",
    _sign:               "06ce8563",
  },

  HERITAGE_PLEDGE: {
    donor_name:    "18427b2e", // 후원자 성명
    org_name:      "736e50e9", // 기관 명칭
    org_rep:       "ba5da01a", // 기관 대표자
    heritage_name: "b31e4440", // 대상 문화유산명
    purpose:       "a25a9184", // 후원 용도
    is_anonymous:  "eeadad93", // 익명 여부 — 텍스트 칸이므로
                               // "익명 희망" / "실명 공개" 문자열로 보낸다.
                               // boolean을 그대로 보내면 서면에 true가 인쇄된다.
    _signName:     "437adf19",
    _sign:         "0f32d749",
  },

  ATTESTATION: {
    subject_name:  "0bd20a62", // 본인 성명
    stated_date:   "ebace6da", // ⚠ 콘솔 표시는 "본인 성명"이나 두문의 확인 일자
                               //    자리여야 한다. 실제 위치를 확인할 것.
                               //    이 칸이 없으면 "언제 시점의 뜻인가"가 빠진다.
    items_summary: "a9a43a3f", // 확인 항목 요약
    content_hash:  "9bbd835b", // 내용 해시값
    _signName:     "7dd0e9ce",
    _sign:         "bb9b3120",
  },

  FAMILY_ACK: {
    family_name:    "04737905", // 가족 성명
    relation:       "dabdd9fe", // 관계
    change_summary: "800d083d", // 변경 내용 요약
    change_reason:  "e6d32d93", // 본인이 밝힌 변경 사유
    _selfName:      "42fa1f43", // 본인 (1순위 서명)
    _selfSign:      "bd779257",
    _familyName:    "10601941", // 가족 (2순위 서명)
    _familySign:    "9172039f",
  },

  CUSTODIAN: {
    custodian_name: "ac8e2fbc", // 지킴이 성명
    view_scope:     "3177b0c3", // 열람 허용 범위
    duties:         "3dd91e2c", // 협조 사항
    _signName:      "f2671b13", // 지킴이
    _sign:          "9d1a01b7",
  },
} as const;

/**
 * 서명자 역할 — participantMappings[].role 에 그대로 들어간다.
 * 콘솔에서 입력한 문자열과 한 글자도 다르면 요청이 거부된다.
 * ⚠ ① 외에는 미확인. 콘솔 값과 대조 후 확정할 것.
 */
export const TEMPLATE_ROLES = {
  DONATION_PLEDGE:   ["기부자"],
  RECURRING_CONSENT: ["후원자"],
  PRIVACY_CONSENT:   ["정보주체"],
  LEGACY_GIFT:       ["기부자"],
  HERITAGE_PLEDGE:   ["후원자"],
  ATTESTATION:       ["본인"],
  FAMILY_ACK:        ["본인", "가족"], // 순서 고정 — 본인이 먼저 (서식 제5조)
  CUSTODIAN:         ["지킴이"],
} as const;

/**
 * DocType → 서식 코드.
 *
 * ⚠ 둘은 **다른 이름 체계다.** DocType은 계약(common.ts)의 문서 종류이고,
 *   서식 코드는 모두싸인 템플릿·PDF 파일명이다. 다섯 종이 서로 다르다.
 *   이 표가 없으면 `sign` 라우트가 넘기는 `draft.docType`이 서식을 못 찾아
 *   8종 중 5종이 서명 요청 자체가 되지 않는다 (실제로 그 상태였다).
 *
 *   FAMILY_ACK은 DocType이 아니다 — 가족 인지 라우트가 서식 코드를 직접 넘긴다.
 */
export const DOCTYPE_TO_TEMPLATE: Record<string, keyof typeof TEMPLATE_LABELS> = {
  DONATION_PLEDGE: "DONATION_PLEDGE",
  RECURRING_CONSENT: "RECURRING_CONSENT",
  PRIVACY_TAX_CONSENT: "PRIVACY_CONSENT",
  LEGACY_GIFT_AGREEMENT: "LEGACY_GIFT",
  HERITAGE_SUPPORT_PLEDGE: "HERITAGE_PLEDGE",
  INTENT_AFFIRMATION: "ATTESTATION",
  CUSTODIAN_AGREEMENT: "CUSTODIAN",
};

/** DocType이든 서식 코드든 받아 서식 코드로 맞춘다. 모르면 던진다 */
export function resolveTemplateCode(key: string): keyof typeof TEMPLATE_LABELS {
  if (key in TEMPLATE_LABELS) return key as keyof typeof TEMPLATE_LABELS;
  const mapped = DOCTYPE_TO_TEMPLATE[key];
  if (!mapped) {
    throw new Error(
      `[template-labels] '${key}'에 해당하는 서식이 없습니다. ` +
        `DocType이라면 DOCTYPE_TO_TEMPLATE에, 서식 코드라면 TEMPLATE_LABELS에 추가하세요.`,
    );
  }
  return mapped;
}

/** 우리 키 → 콘솔 dataLabel. 미등록 키는 던진다 (조용히 빈칸 방지). */
export function toDataLabel(
  templateKey: keyof typeof TEMPLATE_LABELS,
  fieldKey: string,
): string {
  const map = TEMPLATE_LABELS[templateKey] as Record<string, string>;
  const label = map[fieldKey];
  if (!label) {
    throw new Error(
      `[template-labels] ${templateKey}에 '${fieldKey}' 라벨이 없습니다. ` +
      `콘솔에 입력란이 있는지, 이 표가 최신인지 확인하세요.`,
    );
  }
  return label;
}
