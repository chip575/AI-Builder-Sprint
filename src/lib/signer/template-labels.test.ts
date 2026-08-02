// 서식 dataLabel 매핑 테스트
//
// 이 표가 어긋나면 **에러가 나지 않는다.** 값이 API에 실려 나가지 않고
// 서면에는 빈칸이 인쇄된 채로 서명이 끝난다 — 이 프로젝트에서 계속 만난
// "에러가 아니라 침묵" 계열이라 테스트로 고정한다.
import { describe, expect, it } from "vitest";
import { FIELD_SPEC } from "./template-fields";
import {
  DOCTYPE_TO_TEMPLATE,
  TEMPLATE_LABELS,
  TEMPLATE_ROLES,
  resolveTemplateCode,
  toDataLabel,
} from "./template-labels";
import { DocType } from "@/lib/contracts";

const TEMPLATES = Object.keys(TEMPLATE_LABELS) as (keyof typeof TEMPLATE_LABELS)[];

describe("dataLabel 표 — 형식", () => {
  it("모든 라벨이 8자 hex다 — 콘솔이 그 형식으로 생성한다", () => {
    for (const t of TEMPLATES) {
      for (const [field, label] of Object.entries(TEMPLATE_LABELS[t])) {
        expect(label, `${t}.${field}`).toMatch(/^[0-9a-f]{8}$/);
      }
    }
  });

  it("한 서식 안에서 라벨이 중복되지 않는다", () => {
    // 중복이면 두 칸이 같은 값을 받거나 하나가 덮인다
    for (const t of TEMPLATES) {
      const labels = Object.values(TEMPLATE_LABELS[t]);
      expect(new Set(labels).size, t).toBe(labels.length);
    }
  });

  it("등록한 서식이 모두 있다", () => {
    expect(TEMPLATES).toHaveLength(9);
  });
});

describe("🔴 필드 키가 라벨 표에 전부 있다", () => {
  it("template-fields가 만드는 키에 라벨이 빠지면 서면에 빈칸이 인쇄된다", () => {
    const missing: string[] = [];
    for (const t of TEMPLATES) {
      const spec = FIELD_SPEC[t];
      const labels = TEMPLATE_LABELS[t] as Record<string, string>;
      for (const field of Object.keys(spec)) {
        // org_contact처럼 **콘솔에 입력란이 없는** 항목은 예외다.
        // 그 값은 서식에 미리 인쇄돼 있어야 한다 (README 남은 할 일)
        if (!(field in labels)) missing.push(`${t}.${field}`);
      }
    }
    // 예외를 명시적으로 적는다 — 조용히 빠지는 것과 알고 빼는 것은 다르다
    expect(missing).toEqual(["RECURRING_CONSENT.org_contact"]);
  });

  it("라벨 표에만 있고 필드표에 없는 키는 서명란(_)뿐이다", () => {
    for (const t of TEMPLATES) {
      const spec = FIELD_SPEC[t];
      for (const field of Object.keys(TEMPLATE_LABELS[t])) {
        if (field.startsWith("_")) continue; // 서명란 — 값을 보내지 않는다
        expect(Object.keys(spec), `${t}.${field}`).toContain(field);
      }
    }
  });
});

describe("toDataLabel", () => {
  it("우리 키를 콘솔 라벨로 옮긴다", () => {
    // 라벨 값 자체를 박아두지 않는다 — 콘솔에서 입력란을 옮기면 값이 새로 생성되고,
    // 그때마다 이 테스트가 깨져 **진짜 검사(대조 스크립트)가 묻힌다**.
    // 형식과 일관성만 본다. 값이 실재하는지는 verify-templates.mjs가 API로 확인한다
    const label = toDataLabel("DONATION_PLEDGE", "donor_name");
    expect(label).toMatch(/^[0-9a-f]{8}$/);
    expect(label).toBe(TEMPLATE_LABELS.DONATION_PLEDGE.donor_name);
  });

  it("없는 키는 던진다 — 조용히 빈칸이 되지 않게", () => {
    expect(() => toDataLabel("DONATION_PLEDGE", "없는키")).toThrow(/라벨이 없습니다/);
  });
});

describe("서명자 역할", () => {
  it("모든 서식에 역할이 정의돼 있다", () => {
    for (const t of TEMPLATES) {
      expect(TEMPLATE_ROLES[t].length, t).toBeGreaterThan(0);
    }
  });

  /** 상대가 서명해야 완료되는 서식 — **상대가 서명하지 않으면 문서가 완료되지 않는다.**
   *  그 미완료가 결함이 아니라 사실인 서식만 여기 들어온다. 늘리기 전에 다시 생각한다:
   *  · FAMILY_ACK — 가족이 확인해야 확인서다. 안 하면 확인이 없었던 것이다
   *  · REVOCATION_NOTICE — 기관 서명은 **수령 확인**이다. 서식 제2조가 "서명 여부와
   *    관계없이 철회는 성립한다"고 명시하므로, 미완료로 남아도 철회는 유효하다 */
  const TWO_PARTY = new Set(["FAMILY_ACK", "REVOCATION_NOTICE"]);

  it("2인 서식은 둘뿐이고, 순서는 본인이 먼저다", () => {
    for (const t of TEMPLATES) {
      expect(TEMPLATE_ROLES[t].length, t).toBe(TWO_PARTY.has(t) ? 2 : 1);
      if (TWO_PARTY.has(t)) expect(TEMPLATE_ROLES[t][0], t).toBe("본인");
    }
    expect(TEMPLATE_ROLES.FAMILY_ACK).toEqual(["본인", "가족"]); // 서식 제5조
    expect(TEMPLATE_ROLES.REVOCATION_NOTICE).toEqual(["본인", "기관"]); // 서식 제2조
  });

  it("기관 날인란을 참여자로 만들지 않는다 — 서명할 사람이 없으면 영원히 미완료다", () => {
    // 8종에서 기관 날인란을 전부 뺀 이유가 이것이다. 철회 통지서는 예외인데,
    // 거기서는 기관 서명이 **날인이 아니라 수령 확인**이고 안 해도 효력에 영향이 없다
    for (const t of TEMPLATES) {
      if (TWO_PARTY.has(t)) continue;
      expect(TEMPLATE_ROLES[t], t).not.toContain("기관");
    }
  });
});

describe("🔴 DocType → 서식 코드", () => {
  it("서명 대상 DocType이 전부 서식으로 이어진다", () => {
    // 이어지지 않으면 그 문서는 **서명 요청 자체가 되지 않는다**.
    // 실제로 5종이 끊겨 있었다 (PRIVACY_TAX_CONSENT·LEGACY_GIFT_AGREEMENT 등)
    const NOT_SIGNED = [
      "HANDWRITTEN_WILL", // 자필만 유효 — 서명 경로가 없어야 정상 (민법 §1066)
      "HEART_LETTER", // NON_BINDING
      "DIGITAL_LEGACY_INSTRUCTION", // NON_BINDING
      "VOLUNTEER_PLEDGE", // 서식 8종 밖 (FR-206 최소 유지)
    ];
    const missing = DocType.options
      .filter((d) => !NOT_SIGNED.includes(d))
      .filter((d) => !(d in DOCTYPE_TO_TEMPLATE));
    expect(missing).toEqual([]);
  });

  it("서명하지 않는 문서는 서식으로 이어지지 않는다", () => {
    // 유언장에 서식이 붙으면 전자서명 경로가 열린다 — 그 자체가 규칙 위반이다
    expect(DOCTYPE_TO_TEMPLATE.HANDWRITTEN_WILL).toBeUndefined();
    expect(DOCTYPE_TO_TEMPLATE.HEART_LETTER).toBeUndefined();
  });

  it("DocType과 서식 코드 어느 쪽으로 불러도 같은 곳에 닿는다", () => {
    expect(resolveTemplateCode("INTENT_AFFIRMATION")).toBe("ATTESTATION");
    expect(resolveTemplateCode("ATTESTATION")).toBe("ATTESTATION");
    expect(resolveTemplateCode("FAMILY_ACK")).toBe("FAMILY_ACK");
  });

  it("모르는 이름은 던진다", () => {
    expect(() => resolveTemplateCode("NOPE")).toThrow(/해당하는 서식이 없습니다/);
  });
});
