// 상속 기간 룰 테스트 (FR-402)
// 여기서 지킬 것은 값의 정확성보다 **하지 않는 것**이다 — D-day를 계산하지 않고,
// 사망일을 기산점으로 쓰지 않으며, 전문가 상담 권고를 빠뜨리지 않는다.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { debtNoticeStatutes, RENUNCIATION_PERIOD } from "./inheritance";

describe("상속 기간 (민법 §1019)", () => {
  it("기간·조문·출처·확인일이 함께 있다", () => {
    expect(RENUNCIATION_PERIOD.months).toBe(3);
    expect(RENUNCIATION_PERIOD.statute).toContain("1019");
    expect(RENUNCIATION_PERIOD.sourceUrl).toMatch(/^https:/);
    expect(RENUNCIATION_PERIOD.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("안내에 기산점·예외·상담 권고가 들어 있다", () => {
    const [s] = debtNoticeStatutes();
    expect(s!.summary).toContain("안 날부터");   // 사망일이 아니다
    expect(s!.summary).toContain("단순승인");
    expect(s!.summary).toContain("상담");
  });

  it("날짜를 계산하는 코드가 없다 — 기산점을 우리가 모른다", () => {
    // D-day를 보여주면 틀린 날짜로 사람이 상속 결정을 그르친다
    const src = readFileSync("src/lib/rules/inheritance.ts", "utf-8");
    for (const banned of ["Date.now", "new Date(", "setMonth", "getTime"]) {
      expect(src).not.toContain(banned);
    }
    expect(JSON.stringify(debtNoticeStatutes())).not.toMatch(/D-\d|남은 \d+일/);
  });
});
