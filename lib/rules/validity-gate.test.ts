// FR-104 게이트 3분기 픽스처 (AGENTS.md 테스트 규칙 — 게이트는 유닛테스트 필수)
import { describe, expect, it } from "vitest";
import { DocType } from "../contracts/common";
import { canRequestSignature, evaluateGate } from "./validity-gate";

describe("FR-104 게이트 3분기", () => {
  it("유언장 → ESIGN_INVALID + 민법 §1066 인용 + 자필 경로 라우팅", () => {
    const v = evaluateGate("HANDWRITTEN_WILL");
    expect(v.verdict).toBe("ESIGN_INVALID");
    expect(v.statutes.map((s) => s.id)).toContain("민법 §1066");
    expect(v.alternativeRoute).toBe("HANDWRITING_GUIDE");
  });

  it("기부 약정서 → ESIGN_OK", () => {
    expect(evaluateGate("DONATION_PLEDGE").verdict).toBe("ESIGN_OK");
  });

  it("마음의 편지 → NON_BINDING (의도된 무효력)", () => {
    expect(evaluateGate("HEART_LETTER").verdict).toBe("NON_BINDING");
  });

  it("유산기부(사인증여) → ESIGN_OK + 유류분 고지 (00.2 §7.2)", () => {
    const v = evaluateGate("LEGACY_GIFT_AGREEMENT");
    expect(v.verdict).toBe("ESIGN_OK");
    expect(v.statutes.map((s) => s.id)).toContain("민법 §1112");
  });

  it("ESIGN_OK가 아닌 문서는 서명 요청 자체가 불가 (서버 차단)", () => {
    expect(canRequestSignature("HANDWRITTEN_WILL")).toBe(false);
    expect(canRequestSignature("HEART_LETTER")).toBe(false);
    expect(canRequestSignature("DONATION_PLEDGE")).toBe(true);
  });

  it("모든 DocType에 판정이 존재한다 (누락 = 타입 에러이지만 이중 방어)", () => {
    for (const dt of DocType.options) {
      expect(evaluateGate(dt)).toBeDefined();
    }
  });
});
