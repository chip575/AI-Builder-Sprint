// FR-115B 수락 기준 3케이스를 픽스처로 먼저 고정 — 구현이 흔들리지 않게.
import { describe, expect, it } from "vitest";
import { isHeavy } from "./branch-weight";
import { detectExpress } from "./express-detect";

describe("FR-115B Express 판정 — 명세 수락 기준", () => {
  it('"부산에 기부하고 싶어요" → EXPRESS · DONATION_NOW', () => {
    const d = detectExpress("부산에 기부하고 싶어요");
    expect(d).toEqual({ kind: "EXPRESS", branchType: "DONATION_NOW" });
  });

  it('"유언장을 준비하고 싶어요" → EXPRESS · HANDWRITTEN_WILL · 무거운 가지(숙려)', () => {
    const d = detectExpress("유언장을 준비하고 싶어요");
    expect(d).toEqual({ kind: "EXPRESS", branchType: "HANDWRITTEN_WILL" });
    expect(isHeavy("HANDWRITTEN_WILL")).toBe(true); // → 숙려 화면 1회
  });

  it('"뭔가 남기고 싶어요" → Express 아님 (대상 없음 → 축 시작)', () => {
    expect(detectExpress("뭔가 남기고 싶어요").kind).toBe("NONE");
  });
});

describe("경계 케이스 — 혼용 방지·애매 발화", () => {
  it('"문화유산 지키는 데 쓰였으면" → HERITAGE_SUPPORT (DONATION_NOW 아님)', () => {
    const d = detectExpress("문화유산 지키는 데 쓰였으면 좋겠어요");
    expect(d).toEqual({ kind: "EXPRESS", branchType: "HERITAGE_SUPPORT" });
  });

  it('"내가 떠나면 일부는 유산 기부로 남기고 싶어요" → LEGACY_GIFT (무거움)', () => {
    const d = detectExpress("내가 떠나면 일부는 유산 기부로 남기고 싶어요");
    expect(d).toEqual({ kind: "EXPRESS", branchType: "LEGACY_GIFT" });
    expect(isHeavy("LEGACY_GIFT")).toBe(true);
  });

  it('"기부라는 게 어떤 건가요" → UNCERTAIN (대상만 있고 의지 없음 → Solar 분류)', () => {
    expect(detectExpress("기부라는 게 어떤 건가요").kind).toBe("UNCERTAIN");
  });

  it('"정리를 좀 하고 싶은데" → NONE (명세의 애매 발화 예시)', () => {
    expect(detectExpress("정리를 좀 하고 싶은데").kind).toBe("NONE");
  });

  it('"자산이 뭐가 어디 있는지 정리부터 하고 싶어요" → ESTATE', () => {
    const d = detectExpress("자산이 뭐가 어디 있는지 정리부터 하고 싶어요");
    expect(d).toEqual({ kind: "EXPRESS", branchType: "ESTATE" });
  });
});
