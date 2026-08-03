// "~한 상황인데 어떤 걸 작성해야 해?" · "~서류는 세금이 어떻게 돼?"
// 실사용에서 이 두 종류가 통째로 안내를 못 받았다 (2026-08-03).
import { describe, expect, it } from "vitest";
import { detectGuide } from "./guide";
import { detectIntent, docRevocationReply, docTaxReply, recommendDoc } from "./guide-intent";

describe("detectIntent", () => {
  it("선택을 묻는 말만 서류 추천으로 간다", () => {
    expect(detectIntent("혼자 살고 있는데 어떤 걸 작성해야 해?")).toBe("WHICH_DOC");
    expect(detectIntent("무슨 서류를 써야 하나요?")).toBe("WHICH_DOC");
    // 방법을 묻는 말은 아니다 — 이미 서류를 말한 사람이다
    expect(detectIntent("유언장은 어떻게 남기나요?")).not.toBe("WHICH_DOC");
  });

  it("세금·취소는 각자 의도로 갈린다", () => {
    expect(detectIntent("이 서류는 세금이 어떻게 되는 거야?")).toBe("TAX");
    expect(detectIntent("기부하면 세금 혜택이 있나요?")).toBe("TAX");
    expect(detectIntent("이 약정서 나중에 취소할 수 있나요?")).toBe("REVOCATION");
    // 둘 다 있으면 취소가 먼저 — 그때 궁금한 것은 취소다
    expect(detectIntent("취소하면 세금은 어떻게 되나요?")).toBe("REVOCATION");
  });
});

describe("recommendDoc — 상황을 읽어 서류를 고른다", () => {
  it("사후에 남기려는 상황 → 유산 기부 약정서", () => {
    const r = recommendDoc("제가 떠난 뒤에 재산 일부를 남기고 싶은데 어떤 걸 작성해야 해?");
    expect(r?.docType).toBe("LEGACY_GIFT_AGREEMENT");
    expect(r?.reply).toContain("유산 기부 약정서");
  });

  it("지금 기부하려는 상황 → 기부 약정서", () => {
    expect(recommendDoc("고향에 기부하려는데 무슨 서류가 필요해요?")?.docType).toBe(
      "DONATION_PLEDGE",
    );
  });

  it("문화유산은 사후보다 뒤에 걸리지 않는다 — 순서 검사", () => {
    expect(recommendDoc("문화재를 후원하고 싶은데 어떤 서류를 써야 하나요?")?.docType).toBe(
      "HERITAGE_SUPPORT_PLEDGE",
    );
  });

  it("가족에게 물려주는 것은 기부가 아니라 유언이다", () => {
    const r = recommendDoc("딸에게 아파트를 물려주고 싶은데 어떤 서류를 써야 하나요?");
    expect(r?.docType).toBe("HANDWRITTEN_WILL");
    // 서명할 수 있다고 말하지 않는다 (절대규칙 4 · 민법 §1066)
    expect(r?.reply).toContain("전자서명으로 만들 수 없습니다");
  });

  it("상황을 못 읽으면 아무거나 권하지 않는다", () => {
    // 잘못 권하는 것이 안 권하는 것보다 나쁘다
    expect(recommendDoc("어떤 서류를 써야 하나요?")).toBeNull();
  });
});

describe("docTaxReply — 서류마다 답이 다르되 수치는 없다", () => {
  it("기부 약정은 우리 확인 화면이 계산한다고 말한다", () => {
    const r = docTaxReply("DONATION_PLEDGE");
    expect(r).toContain("확인 화면");
    expect(r).toContain("세액공제");
  });

  it("유산 기부·유언은 상속과 얽히므로 문의처로 보낸다", () => {
    expect(docTaxReply("LEGACY_GIFT_AGREEMENT")).toMatch(/126|국세/);
    expect(docTaxReply("HANDWRITTEN_WILL")).toMatch(/126|국세/);
  });

  it("어떤 서류든 수치를 말하지 않는다 (P3)", () => {
    for (const doc of ["DONATION_PLEDGE", "LEGACY_GIFT_AGREEMENT", "HANDWRITTEN_WILL"] as const) {
      // 전화번호(126)는 문의처라 예외 — 공제율·한도 같은 %·원 단위가 없어야 한다
      expect(docTaxReply(doc)).not.toMatch(/\d+\s*%|[0-9,]{4,}\s*원/);
    }
  });
});

describe("docRevocationReply — lib/rules/revocation.ts가 정본이다", () => {
  it("사인증여는 철회할 수 있다고 말한다", () => {
    expect(docRevocationReply("LEGACY_GIFT_AGREEMENT")).toContain("철회");
  });

  it("이미 이행된 기부는 되돌릴 수 없다고 말한다 — 되는 척하지 않는다", () => {
    expect(docRevocationReply("DONATION_PLEDGE")).toContain("되돌릴 수 없습니다");
  });

  it("어느 서류인지 모르면 되묻는다", () => {
    expect(docRevocationReply(null)).toContain("서류마다 다릅니다");
  });
});

describe("안내층 전체 — 실사용 문장으로 확인", () => {
  it("'~한 상황인데 어떤 걸 작성해야 해?' → 서류를 골라 주고 화면이 열 수 있게 한다", () => {
    const g = detectGuide("제가 떠난 뒤에 기부하고 싶은데 어떤 걸 작성해야 해?");
    expect(g?.topic).toBe("WHICH_DOC");
    expect(g?.suggestedDoc).toBe("LEGACY_GIFT_AGREEMENT"); // 화면의 "이 서류로 시작하기"
  });

  it("'이 서류는 세금이 어떻게 되는 거야?' → 그 서류의 세제 안내", () => {
    const g = detectGuide("이 서류는 세금이 어떻게 되는 거야?", "DONATION_PLEDGE");
    expect(g?.topic).toBe("DOC_TAX");
    expect(g?.reply).toContain("확인 화면");
  });

  it("'이 약정서 나중에 취소할 수 있나요?' → 그 서류의 그만두기 안내", () => {
    const g = detectGuide("이 약정서 나중에 취소할 수 있나요?", "LEGACY_GIFT_AGREEMENT");
    expect(g?.topic).toBe("DOC_REVOKE");
    expect(g?.reply).toContain("철회");
  });

  it("서류를 모르면 서류별 답을 하지 않는다 — 무슨 서류 얘기인지 알 수 없다", () => {
    // 통과해야 할 것도 함께 잰다: 기존 주제 카드가 받아야 한다
    expect(detectGuide("이 약정서 나중에 취소할 수 있나요?")?.topic).not.toBe("DOC_REVOKE");
  });
});

describe("조사 — 이름이 표에서 오면 조사도 표에서 나와야 한다", () => {
  it("받침 있는 이름에 '을'이 붙는다", () => {
    // "자필 유언를 쓰시면 됩니다"가 실제로 나왔다 (2026-08-03)
    const r = recommendDoc("딸에게 집을 물려주려면 뭘 써야 해요?");
    expect(r?.reply).toContain("자필 유언을");
    expect(r?.reply).not.toContain("자필 유언를");
  });

  it("받침 없는 이름에 '를'이 붙는다", () => {
    const r = recommendDoc("고향에 기부하려는데 무슨 서류가 필요해요?");
    expect(r?.reply).toContain("기부 약정서를");
  });
});
