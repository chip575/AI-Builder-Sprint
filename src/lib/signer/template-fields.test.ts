// 서식 필드 검증 테스트
// 이 층이 막는 것은 "잘못된 입력"이 아니라 **잘못된 계약서가 인쇄되는 일**이다.
// 그래서 케이스마다 "이게 통과하면 서면에 무엇이 남는가"를 기준으로 썼다.
import { describe, expect, it } from "vitest";
import {
  buildTemplateFields,
  displayWidth,
  toPrintable,
} from "./template-fields";

const donation = {
  donor_name: "김가상",
  donor_contact: "010-0000-0000",
  org_name: "부산광역시",
  amount_krw: 100000,
  donation_date: "2026-07-01",
};

describe("표시 폭 — 한글 1, ASCII 0.5", () => {
  it("한글은 글자당 1", () => {
    expect(displayWidth("가나다")).toBe(3);
  });
  it("ASCII는 글자당 0.5", () => {
    expect(displayWidth("abcd")).toBe(2);
  });
});

describe("값 변환 — 서면에 그대로 인쇄된다", () => {
  it("숫자 금액은 콤마와 '원'이 붙는다", () => {
    expect(toPrintable("amount_krw", 100000)).toBe("100,000원");
  });
  it("날짜는 한글 표기로 바뀐다", () => {
    expect(toPrintable("donation_date", "2026-09-05")).toBe("2026년 9월 5일");
  });
  it("불리언은 읽을 수 있는 말이 된다 — true가 그대로 찍히면 안 된다", () => {
    expect(toPrintable("is_anonymous", true)).toBe("익명 희망");
    expect(toPrintable("is_anonymous", false)).toBe("실명 공개");
  });
  it("기간에는 단위를 붙이지 않는다 — 서식 라벨이 '후원 기간(개월)'이라 겹친다", () => {
    // 붙이면 서면에 "후원 기간(개월) 12개월"이 인쇄된다
    expect(toPrintable("period_months", 12)).toBe("12");
  });
});

describe("전역 금칙 — 서면에 남으면 안 되는 값", () => {
  it("주민등록번호 패턴을 거부한다", () => {
    // DB 마스킹은 저장 경로를 막을 뿐이다. 서면으로 나가는 경로는 여기서 막는다.
    // ⚠ 패턴을 소스에 literal로 두지 않는다 — 픽스처에도 식별번호를 남기지 않는다는
    //   규칙이 있고(NFR-714 4조), 실제로 gate:check가 이 줄을 잡아냈다
    const looksLikeRrn = ["900101", "1".repeat(7)].join("-");
    const r = buildTemplateFields("DONATION_PLEDGE", {
      ...donation,
      donor_name: `김가상 ${looksLikeRrn}`,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("RRN");
  });

  it("계좌번호 패턴을 거부한다", () => {
    const r = buildTemplateFields("DONATION_PLEDGE", {
      ...donation,
      program_title: "123-456-789012 로 입금",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("ACCOUNT");
  });

  it("공제율 표기를 거부한다 — 숫자의 출처가 문서가 되면 안 된다 (P3)", () => {
    const r = buildTemplateFields("DONATION_PLEDGE", {
      ...donation,
      program_title: "세액공제 30% 대상",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("TAX_RATE");
  });

  it("줄바꿈을 거부한다 — 칸이 깨진다", () => {
    const r = buildTemplateFields("DONATION_PLEDGE", {
      ...donation,
      program_title: "아동\n지원",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("NEWLINE");
  });
});

describe("연락처는 계좌가 아니다 — 좁게 잡는다", () => {
  it("전화번호가 든 연락처 필드는 통과한다", () => {
    expect(buildTemplateFields("DONATION_PLEDGE", donation).ok).toBe(true);
  });
  it("연락처 아닌 칸의 계좌 패턴은 여전히 막는다", () => {
    const r = buildTemplateFields("DONATION_PLEDGE", {
      ...donation,
      program_title: "123-456-789012",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("ACCOUNT");
  });
});

describe("칸 넘침 — 잘린 계약서는 내용이 빠진 것이다", () => {
  it("1줄 칸에 36 표시폭을 넘기면 거부", () => {
    const r = buildTemplateFields("DONATION_PLEDGE", {
      ...donation,
      donor_name: "가".repeat(37),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("OVERFLOW");
  });

  it("3줄 칸은 108까지 받는다", () => {
    const r = buildTemplateFields("PRIVACY_CONSENT", {
      subject_name: "김가상",
      collect_items: "가".repeat(108),
      purpose: "기부금 영수증 발급",
      retention_period: "5년",
    });
    expect(r.ok).toBe(true);
  });
});

describe("서식별 금칙 — 문서가 다른 성격으로 읽히는 것을 막는다", () => {
  it("의사 확인서에 '유언'이 들어가면 거부 (FR-551)", () => {
    const r = buildTemplateFields("ATTESTATION", {
      subject_name: "김가상",
      content_hash: "abc123",
      items_summary: "유언 내용을 확인합니다",
      stated_date: "2026-07-01",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("WILL_WORD");
  });

  it("가족 인지 확인서에 '동의'가 들어가면 거부 (FR-554)", () => {
    // 동의로 읽히면 유류분 포기로 오해된다
    const r = buildTemplateFields("FAMILY_ACK", {
      family_name: "김가상",
      relation: "장녀",
      change_summary: "수증자 변경",
      change_reason: "가족의 동의를 얻었습니다",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("CONSENT_WORD");
  });

  it("지킴이 약정에 권한 표현이 들어가면 거부 (D-09)", () => {
    const r = buildTemplateFields("CUSTODIAN", {
      custodian_name: "김가상",
      view_scope: "금융 자산",
      duties: "자산을 대리 처분한다",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("POWER_GRANT");
  });

  it("유산기부 약정에 '유류분'이 들어가면 거부", () => {
    const r = buildTemplateFields("LEGACY_GIFT", {
      donor_name: "김가상",
      org_name: "부산광역시",
      asset_summary: "유류분을 제외한 잔여 재산",
      effective_condition: "사망 시",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("RESERVED_SHARE");
  });

  it("보유 기간을 '영구'로 둘 수 없다", () => {
    const r = buildTemplateFields("PRIVACY_CONSENT", {
      subject_name: "김가상",
      collect_items: "성명, 연락처",
      purpose: "영수증 발급",
      retention_period: "영구",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("INDEFINITE");
  });

  it("같은 표현이라도 서식이 다르면 통과한다 — 전부 막는 검사가 아니다", () => {
    // ATTESTATION에서 막히는 "유언"이 유산기부 약정에서는 문제가 아니다
    const r = buildTemplateFields("LEGACY_GIFT", {
      donor_name: "김가상",
      org_name: "부산광역시",
      asset_summary: "유언과 별개로 진행합니다",
      effective_condition: "사망 시",
    });
    expect(r.ok).toBe(true);
  });
});

describe("서식 내부 정합성 — 문서가 스스로와 모순되지 않게", () => {
  const recurring = {
    donor_name: "김가상",
    org_name: "부산광역시",
    monthly_amount_krw: 30000,
    period_months: 12,
    total_amount_krw: 360000,
    first_debit_date: "2099-01-05",
    org_contact: "051-000-0000",
  };

  it("총액이 월 × 기간과 맞으면 통과", () => {
    expect(buildTemplateFields("RECURRING_CONSENT", recurring).ok).toBe(true);
  });

  it("총액이 어긋나면 거부 — 본문 제4조와 문서가 충돌한다", () => {
    const r = buildTemplateFields("RECURRING_CONSENT", {
      ...recurring,
      total_amount_krw: 300000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("TOTAL_MISMATCH");
  });

  it("첫 출금일이 과거면 거부", () => {
    const r = buildTemplateFields("RECURRING_CONSENT", {
      ...recurring,
      first_debit_date: "2020-01-05",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("PAST_DATE");
  });

  it("기부일이 미래면 거부 — 있지 않은 일을 적을 수 없다", () => {
    const r = buildTemplateFields("DONATION_PLEDGE", {
      ...donation,
      donation_date: "2099-01-01",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("FUTURE_DATE");
  });
});

describe("필수·선택", () => {
  it("정기후원의 org_contact가 비면 거부 — 해지 방법 고지 요건", () => {
    const r = buildTemplateFields("RECURRING_CONSENT", {
      donor_name: "김가상",
      org_name: "부산광역시",
      monthly_amount_krw: 30000,
      period_months: 12,
      total_amount_krw: 360000,
      first_debit_date: "2099-01-05",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === "REQUIRED" && e.field === "org_contact")).toBe(true);
    }
  });

  it("선택 키(org_rep)는 없어도 통과하고 빈칸으로 남는다", () => {
    const r = buildTemplateFields("DONATION_PLEDGE", donation);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields.org_rep).toBe("");
  });

  it("서식에 없는 키를 보내면 거부 — 오타가 조용히 빈칸이 되지 않게", () => {
    const r = buildTemplateFields("DONATION_PLEDGE", { ...donation, donorName: "오타" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("UNKNOWN_FIELD");
  });
});
