// 모두싸인 템플릿 dataLabel ↔ 우리 필드 키 매핑
//
// 왜 이 파일이 있는가:
//   콘솔이 입력란마다 랜덤 hex(dataLabel)를 **자동 생성한다.** 콘솔에서 이름을
//   지정해도 API 식별자는 그 자동 생성값이라(2026-08-01 실측), 우리 키로 말하고
//   API로 나갈 때 번역한다. 번역은 어댑터의 일이다.
//
// ⚠ 취약점: 입력란을 옮기거나 다시 만들면 dataLabel이 **새로 생성되어** 이 표가 죽는다.
//   실제로 8종을 요청자 입력으로 옮기면서 전 라벨이 한 번 갈렸다.
//   그때 증상은 에러가 아니라 **조용한 빈칸**이다 — 값이 빠진 채 서명이 끝난다.
//   `toDataLabel()`은 우리 표에 없는 키를 던져 잡지만 라벨 값이 바뀐 경우는 못 잡는다.
//   그래서 왕복·배포 전에 `node scripts/verify-templates.mjs`로 대조한다.
//
// v3 (2026-08-01): 8종 전부 **요청자 입력** 구조로 전환한 뒤 API 덤프에서 생성.
//   서명자에게는 성명 텍스트와 서명만 남기고, 나머지는 우리가 채운다 —
//   대화로 정리한 내용을 사용자가 서명 화면에서 다시 타이핑하지 않게 하는 것이 목적이다.
//   기관 날인란은 전부 삭제됐다 (⑤에 있던 두 번째 SIGNATURE 포함).
//   손으로 옮겨 적지 않았다: scripts/verify-templates.mjs --dump 결과를 파싱했다.

export const TEMPLATE_LABELS = {
  DONATION_PLEDGE: {
    donor_name:     "937759e9", // 기부자 성명
    donor_contact:  "1aeb97f8", // 기부자 연락처
    org_name:       "e371ecaa", // 기관 명칭
    org_rep:        "1f8879c9", // 기관 대표자
    program_title:  "3672d34b", // 기부 사업명
    amount_krw:     "c5d625b4", // 기부 금액
    donation_date:  "9acd3b9e", // 약정 체결일
    _sign:          "9fcbffae", // 서명란 · 기부자
    _signName:      "ac9780d1", // 서명란 · 기부자
  },

  RECURRING_CONSENT: {
    donor_name:          "13cf0748", // 후원자 성명
    org_name:            "85150152", // 기관 명칭
    org_rep:             "c960739e", // 기관 대표자
    monthly_amount_krw:  "25bd34c3", // 월 후원금액
    period_months:       "b3b721f8", // 후원 기간(개월)
    total_amount_krw:    "96bb76d2", // 총 후원금액
    first_debit_date:    "e3fb063a", // 최초 출금일
    _signName:           "261a7031", // 서명란 · 후원자
    _sign:               "5f51dfeb", // 서명란 · 후원자
  },

  PRIVACY_CONSENT: {
    subject_name:      "718b2ea9", // 정보주체 성명
    org_name:          "78261d7f", // 개인정보처리자
    collect_items:     "24eb034e", // 수집하는 항목
    purpose:           "07320f60", // 이용하는 목적
    retention_period:  "7c1608fb", // 보유하는 기간
    _signName:         "259fd5b4", // 서명란 · 정보주체
    _sign:             "6c353e3c", // 서명란 · 정보주체
  },

  LEGACY_GIFT: {
    donor_name:           "73fbcf62", // 기부자 성명
    org_name:             "cc2f301d", // 수혜 기관명
    org_rep:              "b4bb303b", // 기관 대표자
    asset_summary:        "70995ad8", // 기부 대상 재산
    effective_condition:  "08d723b0", // 효력이 발생하는 조건
    _signName:            "c9f61136", // 서명란 · 기부자
    _sign:                "06ce8563", // 서명란 · 기부자
  },

  HERITAGE_PLEDGE: {
    donor_name:     "0c4212c4", // 후원자 성명
    org_name:       "4468e0cb", // 기관 명칭
    org_rep:        "531cc81e", // 기관 대표자
    heritage_name:  "c1dd62d1", // 대상 문화유산명
    purpose:        "ec4703ae", // 후원 용도
    is_anonymous:   "616d8b8d", // 익명 여부 — 문자열로 보낸다
    _sign:          "0f32d749", // 서명란 · 후원자
    _signName:      "437adf19", // 서명란 · 후원자
  },

  ATTESTATION: {
    stated_date:    "2f68313c", // 두문 확인 일자
    subject_name:   "e3ab54c8", // 본인 성명
    items_summary:  "879fa032", // 확인 항목 요약
    content_hash:   "fbcd05b7", // 내용 해시값
    _sign:          "bb9b3120", // 서명란 · 본인
    _signName:      "7dd0e9ce", // 서명란 · 본인
  },

  FAMILY_ACK: {
    family_name:     "cd117c89", // 가족 성명
    relation:        "890c0870", // 관계
    change_summary:  "d18acbf2", // 변경 내용 요약
    change_reason:   "faf89559", // 본인이 밝힌 변경 사유
    _selfName:       "42fa1f43", // 서명란 · 본인
    _selfSign:       "bd779257", // 서명란 · 본인
    _familyName:     "5d39f3d3", // 서명란 · 가족
    _familySign:     "13a6f37a", // 서명란 · 가족
  },

  CUSTODIAN: {
    custodian_name:  "2af33dc7", // 지킴이 성명
    view_scope:      "0fcfda3a", // 열람 허용 범위
    duties:          "6f82d5ad", // 협조 사항
    _signName:       "48e47c1d", // 서명란 · 지킴이
    _sign:           "0a308312", // 서명란 · 지킴이
  },

} as const;

/**
 * 서명자 역할 — participantMappings[].role 에 그대로 들어간다.
 * 콘솔에서 입력한 문자열과 한 글자도 다르면 요청이 거부된다.
 * ✔ 2026-08-01 템플릿 상세 조회 API로 8종 전부 확인 — 이 표와 일치한다.
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
