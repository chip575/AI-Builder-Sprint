// 서식 필드 조립·검증 (모두싸인 템플릿 데이터 라벨)
//
// **이 층에 들어가는 값은 서명되는 계약서 본문의 일부가 된다.** 그래서 여기 검증은
// 입력 편의(UX)가 아니라 법적 통제다. 실패는 경고가 아니라 거부다.
//
// 왜 이 자리인가 — 다른 층이 못 보는 것만 본다:
//   · `gate:check`는 **소스 파일**을 grep한다. 사용자가 입력한 값은 보지 못한다
//   · `maskIdentifier`는 **우리 DB에 저장될 때** 가린다. 서면으로 나가는 경로는 다르다
//   · 계약(Zod)은 API 입출력의 모양을 본다. 칸에 몇 자가 들어가는지는 모른다
// 그래서 주민번호·계좌 패턴을 여기서 다시 본다. 중복이 아니라 **다른 관문**이다 —
// 이걸 통과하면 값은 제3자에게 가는 문서에 인쇄된다.
//
// 근거: files (9)/README.md (서식 8종 v3, 계약서 체재)

/** 서식 코드 — 모두싸인 템플릿과 1:1. MODUSIGN_TEMPLATE_<코드> env로 ID를 받는다 */
export type TemplateKey =
  | "DONATION_PLEDGE"
  | "RECURRING_CONSENT"
  | "PRIVACY_CONSENT"
  | "LEGACY_GIFT"
  | "HERITAGE_PLEDGE"
  | "ATTESTATION"
  | "FAMILY_ACK"
  | "CUSTODIAN"
  | "REVOCATION_NOTICE";

/** 칸 한 줄의 표시 폭 상한. 한글·전각 1, ASCII·반각 0.5로 센다.
 *  v3에서 칸이 넓어져 실측 44.8자가 됐지만 상한은 36 그대로다 — 여유가 늘었을 뿐이다. */
const WIDTH_PER_LINE = 36;

/** 표시 폭. 넘치면 렌더링에서 잘리고, 잘린 계약서는 내용이 빠진 것이라 그 자체로 하자다. */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    // ASCII·반각은 0.5, 그 밖(한글·한자·전각 기호)은 1
    w += code < 0x0100 || (code >= 0xff61 && code <= 0xffdc) ? 0.5 : 1;
  }
  return w;
}

interface FieldSpec {
  /** 칸 줄 수 — 상한은 lines × 36 */
  lines: 1 | 2 | 3;
  /** 비면 그 서식의 법적 요건이 성립하지 않는 필드 */
  required?: boolean;
}

/** 8종 필드표. 키 이름은 모두싸인 콘솔의 입력란 이름과 **자구가 일치**해야 한다 —
 *  다르면 값이 조용히 빈칸으로 인쇄된다. */
export const FIELD_SPEC: Record<TemplateKey, Record<string, FieldSpec>> = {
  DONATION_PLEDGE: {
    donor_name: { lines: 1, required: true },
    donor_contact: { lines: 1, required: true },
    org_name: { lines: 1, required: true },
    program_title: { lines: 2 },
    amount_krw: { lines: 1, required: true },
    donation_date: { lines: 1, required: true },
    org_rep: { lines: 1 }, // 선택 — 미지정 시 빈칸
  },
  RECURRING_CONSENT: {
    donor_name: { lines: 1, required: true },
    org_name: { lines: 1, required: true },
    monthly_amount_krw: { lines: 1, required: true },
    period_months: { lines: 1, required: true },
    total_amount_krw: { lines: 1, required: true },
    first_debit_date: { lines: 1, required: true },
    org_rep: { lines: 1 },
    // 해지 방법 고지의 연락처 자리다. 비면 **해지 요건이 성립하지 않는다** (README 남은 할 일)
    org_contact: { lines: 1, required: true },
  },
  PRIVACY_CONSENT: {
    subject_name: { lines: 1, required: true },
    collect_items: { lines: 3, required: true },
    purpose: { lines: 3, required: true },
    retention_period: { lines: 2, required: true },
    org_name: { lines: 1 },
  },
  LEGACY_GIFT: {
    donor_name: { lines: 1, required: true },
    org_name: { lines: 1, required: true },
    asset_summary: { lines: 3, required: true },
    effective_condition: { lines: 2, required: true },
    org_rep: { lines: 1 },
  },
  HERITAGE_PLEDGE: {
    donor_name: { lines: 1, required: true },
    heritage_name: { lines: 2, required: true },
    purpose: { lines: 2, required: true },
    is_anonymous: { lines: 1, required: true },
    org_name: { lines: 1 },
    org_rep: { lines: 1 },
  },
  ATTESTATION: {
    subject_name: { lines: 1, required: true },
    content_hash: { lines: 2, required: true },
    items_summary: { lines: 3, required: true },
    stated_date: { lines: 1, required: true },
  },
  FAMILY_ACK: {
    family_name: { lines: 1, required: true },
    relation: { lines: 1, required: true },
    change_summary: { lines: 3, required: true },
    change_reason: { lines: 3, required: true },
  },
  CUSTODIAN: {
    custodian_name: { lines: 1, required: true },
    view_scope: { lines: 2, required: true },
    duties: { lines: 3, required: true },
  },
  // 여섯 칸 전부 우리가 채운다 — 값의 출처가 전부 우리에게 있다.
  // 서명자가 타이핑하면 문서에 인쇄된 내용과 원장이 갈라지고, 나중에
  // "무엇을 철회했나"에 답이 둘이 된다
  REVOCATION_NOTICE: {
    revoker_name: { lines: 1, required: true },
    revoker_contact: { lines: 1, required: true },
    org_name: { lines: 1, required: true },
    original_agreement: { lines: 2, required: true },
    // 사용자가 자유롭게 쓰는 칸. 철회는 사유의 당부와 무관하게 효력이 있으므로
    // (서식 제4조) 내용을 검사하지 않는다 — 길이만 본다
    revocation_reason: { lines: 3, required: true },
    revocation_date: { lines: 1, required: true },
  },
};

export interface FieldError {
  code: string;
  field: string;
  message: string;
}

/** 연락처를 담는 필드. 전화번호는 계좌번호와 **자릿수 모양이 같아서**
 *  계좌 검사에서 제외해야 한다 — 안 그러면 정상 입력이 거부된다.
 *  (실제로 `010-0000-0000`이 걸렸다. 통과해야 할 케이스가 없었으면 못 봤을 것) */
const CONTACT_FIELDS = new Set(["donor_contact", "org_contact"]);

/** 전역 금칙 — 모든 서식의 모든 값에 적용된다 */
const GLOBAL_GUARDS: { code: string; test: RegExp; message: string; skipFields?: Set<string> }[] = [
  {
    code: "RRN",
    test: /\d{6}\s*-\s*\d{7}/,
    // 이 값은 제3자에게 가는 문서에 인쇄된다. DB 마스킹으로는 막지 못하는 경로다
    message: "주민등록번호로 보이는 값이 있습니다. 서면에 남길 수 없습니다.",
  },
  {
    code: "ACCOUNT",
    test: /\d{2,6}\s*-\s*\d{2,6}\s*-\s*\d{2,8}/,
    message: "계좌번호로 보이는 값이 있습니다. 서면에 남길 수 없습니다.",
    skipFields: CONTACT_FIELDS,
  },
  {
    code: "TAX_RATE",
    test: /\d+\s*%|공제율/,
    // 공제율은 룰테이블이 갖는다. 서면에 박히면 그 숫자의 출처가 문서가 된다 (P3)
    message: "공제율·비율 표기는 약정서에 넣지 않습니다.",
  },
  {
    code: "NEWLINE",
    test: /[\r\n\t]/,
    message: "줄바꿈·탭이 들어가면 칸이 깨집니다.",
  },
];

/** 서식별 금칙 — 각 항목이 그 서식의 법적 방어선과 1:1로 대응한다.
 *  문구를 지우는 게 목적이 아니라 **문서가 다른 성격으로 읽히는 것**을 막는다. */
const FORM_GUARDS: {
  code: string;
  template: TemplateKey;
  fields: string[] | "*";
  test: RegExp;
  message: string;
}[] = [
  {
    code: "WILL_WORD",
    template: "ATTESTATION",
    fields: "*",
    test: /유언/,
    // 의사 확인서가 유언장으로 읽히면 민법 §1066의 요식성 문제가 생긴다 (FR-551)
    message: "의사 확인서에는 '유언'이라는 표현을 쓰지 않습니다.",
  },
  {
    code: "CONSENT_WORD",
    template: "FAMILY_ACK",
    fields: ["change_summary", "change_reason"],
    test: /동의/,
    // 가족의 서명은 인지이지 동의가 아니다. 동의로 읽히면 유류분 포기로 오해된다 (FR-554)
    message: "가족 인지 확인서에는 '동의'라는 표현을 쓰지 않습니다.",
  },
  {
    code: "POWER_GRANT",
    template: "CUSTODIAN",
    fields: ["duties", "view_scope"],
    test: /대리|위임|처분|관리 ?권|권한을 부여/,
    // 지킴이는 유언집행자가 아니다. 권한 표현이 들어가면 본문 제4조와 충돌한다 (D-09)
    message: "보관·집행 협조 범위를 넘는 권한 표현은 넣을 수 없습니다.",
  },
  {
    code: "RESERVED_SHARE",
    template: "LEGACY_GIFT",
    fields: ["asset_summary", "effective_condition"],
    test: /유류분/,
    // 기관이 유류분을 산정한 것으로 읽힌다. 우리는 그 계산을 하지 않는다
    message: "유류분은 약정서에서 다루지 않습니다.",
  },
  {
    code: "VAGUE",
    template: "PRIVACY_CONSENT",
    fields: "*",
    test: /기타 ?등등|등등/,
    message: "수집 항목·목적은 구체적으로 적어야 합니다.",
  },
  {
    code: "INDEFINITE",
    template: "PRIVACY_CONSENT",
    fields: ["retention_period"],
    test: /영구|무기한/,
    // 최소 보유 원칙 — 기간을 특정하지 않으면 동의로서 성립하기 어렵다
    message: "보유 기간은 '영구·무기한'으로 둘 수 없습니다.",
  },
];

/** 값 → 서면 문자열. 모두싸인에는 전부 문자열로 가야 한다 —
 *  숫자·불리언을 그대로 보내면 `100000`, `true`가 그대로 인쇄된다. */
export function toPrintable(field: string, value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") {
    // ⑤ is_anonymous — 서면에서 읽히는 말로 바꾼다
    return value ? "익명 희망" : "실명 공개";
  }
  if (typeof value === "number") {
    // ⚠ 단위는 **서식이 이미 가진 것과 겹치지 않게** 붙인다.
    //   ①②의 금액 칸 라벨은 "기부 금액"·"월 후원금액"이라 단위가 없다 → "원"을 붙인다.
    //   ②의 기간 칸은 라벨이 "후원 기간(개월)"이라 이미 단위가 있다 → 숫자만 넣는다.
    //   (typst/lib.typ에 단위를 덧붙이는 코드가 없음을 원본에서 확인, 2026-07-31)
    return field.endsWith("_krw")
      ? `${value.toLocaleString("ko-KR")}원`
      : String(value);
  }
  const s = String(value);
  // YYYY-MM-DD → YYYY년 M월 D일
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
  return s;
}

/** 서식 내부 정합성 — JSON Schema로는 표현할 수 없는 규칙.
 *  ⚠ 이건 gate:check가 못 보는 **문서 내부의 모순**이다. 총액이 어긋나면
 *  약정서가 스스로와 충돌한다 (② 제4조). */
function checkConsistency(
  template: TemplateKey,
  raw: Record<string, unknown>,
): FieldError[] {
  const errs: FieldError[] = [];
  const today = new Date().toISOString().slice(0, 10);

  if (template === "RECURRING_CONSENT") {
    const monthly = Number(raw.monthly_amount_krw);
    const months = Number(raw.period_months);
    const total = Number(raw.total_amount_krw);
    if (
      Number.isFinite(monthly) &&
      Number.isFinite(months) &&
      Number.isFinite(total) &&
      monthly * months !== total
    ) {
      errs.push({
        code: "TOTAL_MISMATCH",
        field: "total_amount_krw",
        message: "총액이 월 납입액 × 기간과 맞지 않습니다.",
      });
    }
    const first = String(raw.first_debit_date ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(first) && first < today) {
      errs.push({
        code: "PAST_DATE",
        field: "first_debit_date",
        message: "첫 출금일이 지난 날짜입니다.",
      });
    }
  }

  // 있었던 일을 앞으로 있을 일처럼 적을 수 없다
  for (const [tmpl, field] of [
    ["DONATION_PLEDGE", "donation_date"],
    ["ATTESTATION", "stated_date"],
  ] as const) {
    if (template !== tmpl) continue;
    const v = String(raw[field] ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v > today) {
      errs.push({ code: "FUTURE_DATE", field, message: "앞으로 올 날짜는 넣을 수 없습니다." });
    }
  }
  return errs;
}

export type ValidateResult =
  | { ok: true; fields: Record<string, string> }
  | { ok: false; errors: FieldError[] };

/**
 * 서식에 넣을 값을 검증하고 **문자열로 조립**한다.
 * realSigner가 템플릿을 호출하기 직전에 반드시 이걸 통과시킨다.
 */
export function buildTemplateFields(
  template: TemplateKey,
  raw: Record<string, unknown>,
): ValidateResult {
  const spec = FIELD_SPEC[template];
  const errors: FieldError[] = [];
  const fields: Record<string, string> = {};

  for (const [field, s] of Object.entries(spec)) {
    const printed = toPrintable(field, raw[field]);

    if (printed === "") {
      if (s.required) {
        errors.push({
          code: "REQUIRED",
          field,
          message: "이 칸이 비면 서식의 요건이 성립하지 않습니다.",
        });
      }
      fields[field] = ""; // 선택 항목은 빈칸으로 남는다
      continue;
    }

    for (const g of GLOBAL_GUARDS) {
      if (g.skipFields?.has(field)) continue;
      if (g.test.test(printed)) errors.push({ code: g.code, field, message: g.message });
    }
    for (const g of FORM_GUARDS) {
      if (g.template !== template) continue;
      if (g.fields !== "*" && !g.fields.includes(field)) continue;
      if (g.test.test(printed)) errors.push({ code: g.code, field, message: g.message });
    }

    const limit = s.lines * WIDTH_PER_LINE;
    if (displayWidth(printed) > limit) {
      // 잘린 계약서는 내용이 빠진 것이다 — 경고가 아니라 거부다
      errors.push({
        code: "OVERFLOW",
        field,
        message: "내용이 칸을 넘칩니다. 줄이면 서면에 온전히 실립니다.",
      });
    }
    fields[field] = printed;
  }

  // 서식에 없는 키를 보내면 모두싸인이 무시하거나 실패한다. 오타를 여기서 잡는다
  for (const key of Object.keys(raw)) {
    if (!(key in spec)) {
      errors.push({ code: "UNKNOWN_FIELD", field: key, message: "이 서식에 없는 항목입니다." });
    }
  }

  errors.push(...checkConsistency(template, raw));

  return errors.length > 0 ? { ok: false, errors } : { ok: true, fields };
}
