import { describe, expect, it } from "vitest";
import { eulReul, eunNeun, hasBatchim, iGa, josa } from "./korean";

describe("조사 선택", () => {
  it("받침이 있으면 은/이/을", () => {
    expect(eunNeun("금액")).toBe("금액은"); // 액 — 받침 ㄱ
    expect(eunNeun("기부하실 지역")).toBe("기부하실 지역은"); // 역 — 받침 ㄱ
    expect(iGa("부산")).toBe("부산이"); // 산 — 받침 ㄴ
    expect(eulReul("서류")).toBe("서류를"); // 류 — 받침 없음
  });

  it("받침이 없으면 는/가/를", () => {
    expect(eunNeun("어머니")).toBe("어머니는");
    expect(iGa("아버지")).toBe("아버지가");
    expect(eulReul("아이")).toBe("아이를");
  });

  it("한글이 아닌 끝 글자는 받침 없음으로 본다", () => {
    // 숫자·영문으로 끝나는 값에 억지 판정을 하지 않는다. 우리 문장은 라벨에 조사를
    // 붙이므로 실무상 여기 오지 않지만, 오더라도 깨지지 않아야 한다
    expect(hasBatchim("100")).toBe(false);
    expect(hasBatchim("Busan")).toBe(false);
    expect(hasBatchim("")).toBe(false);
  });

  it("금액 표기는 한글 끝 글자로 판정된다", () => {
    expect(eunNeun("1,000,000원")).toBe("1,000,000원은"); // 원 — 받침 ㄴ
  });

  it("josa로 임의 조사 쌍도 고를 수 있다", () => {
    expect(josa("부산", "으로", "로")).toBe("으로");
    expect(josa("대구", "으로", "로")).toBe("로");
  });
});
