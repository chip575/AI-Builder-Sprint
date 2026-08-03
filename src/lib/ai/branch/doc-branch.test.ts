// 작성실이 고른 서류가 곧 가지다 — 첫 발화를 되짚어 알아맞히지 않는다
import { describe, expect, it } from "vitest";
import { branchForDoc } from "./doc-branch";
import { BRANCH_PRIMARY_DOC } from "../../rules/branch-doc";

describe("branchForDoc", () => {
  it("작성실의 세 서류가 각자 가지로 돌아온다", () => {
    expect(branchForDoc("DONATION_PLEDGE")).toBe("DONATION_NOW");
    expect(branchForDoc("HERITAGE_SUPPORT_PLEDGE")).toBe("HERITAGE_SUPPORT");
    expect(branchForDoc("LEGACY_GIFT_AGREEMENT")).toBe("LEGACY_GIFT");
  });

  it("가지 표에 없는 서류는 null — 억지로 가지를 붙이지 않는다", () => {
    // 마음 편지는 슬롯을 모으는 대화가 아니다. 없는 것이 옳다
    expect(branchForDoc("HEART_LETTER")).toBeNull();
    expect(branchForDoc(null)).toBeNull();
    expect(branchForDoc(undefined)).toBeNull();
  });

  it("정본(BRANCH_PRIMARY_DOC)을 뒤집은 것과 어긋나지 않는다", () => {
    // 이 검사가 있어야 정본이 바뀌었을 때 역매핑이 조용히 낡지 않는다
    for (const [branch, doc] of Object.entries(BRANCH_PRIMARY_DOC)) {
      expect(branchForDoc(doc)).toBe(branch);
    }
  });
});
