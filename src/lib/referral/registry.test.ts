// 문의처 — **틀린 번호는 안내가 없는 것보다 나쁘다.** 사용자가 실제로 건다.
// 그래서 검사는 "무슨 말이 나오나"보다 **"확인 안 된 값이 새어 나가나"** 를 본다.
import { describe, expect, it } from "vitest";
import { REFERRALS, allReferralText, referralText, type ReferralTopic } from "./registry";

const topics = Object.keys(REFERRALS) as ReferralTopic[];

describe("값의 출처가 남아 있다", () => {
  it.each(topics)("%s — 출처 주소와 확인 날짜가 있다", (t) => {
    const r = REFERRALS[t];
    expect(r.source.url).toMatch(/^https:\/\//);
    expect(r.source.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.each(topics)("%s — 안내 주소는 https다", (t) => {
    // http로 안내하면 사용자가 가로채기 쉬운 경로로 간다
    expect(REFERRALS[t].url).toMatch(/^https:\/\//);
  });
});

describe("확인하지 못한 번호를 지어내지 않는다", () => {
  it("번호가 없으면 문장에서 통째로 빠진다 — 빈 자리를 남기지 않는다", () => {
    // "전화 (번호 없음)"처럼 남기면 사용자는 우리가 뭔가 빠뜨렸다고 읽는다
    const t = referralText("HOMETOWN_DONATION");
    expect(REFERRALS.HOMETOWN_DONATION.phone).toBeNull();
    expect(t).not.toContain("전화");
    expect(t).toContain("ilovegohyang.go.kr");
  });

  it("번호가 있으면 번호와 주소를 함께 준다 — 통과 케이스", () => {
    // 빠지는 것만 재면 "항상 번호를 빼는 함수"와 구분할 수 없다
    const t = referralText("INHERITANCE_LAW");
    expect(t).toContain("전화 132");
    expect(t).toContain("klac.or.kr");
  });

  it("번호 자리에 그럴듯한 가짜가 들어 있지 않다", () => {
    for (const t of topics) {
      const p = REFERRALS[t].phone;
      if (p == null) continue;
      // 대표번호는 짧은 국번 없는 번호이거나 15xx/16xx 대표번호다.
      // 010-xxxx-xxxx 같은 개인 번호 모양이 들어오면 지어낸 값이다
      expect(p, t).not.toMatch(/^01[016-9]/);
      expect(p, t).toMatch(/^(\d{3}|1[3-9]\d{2}-\d{4})$/);
    }
  });
});

describe("누구에게 거는지 알 수 있다", () => {
  it.each(topics)("%s — 기관 이름과 어떤 물음인지가 문장에 있다", (t) => {
    const text = referralText(t);
    expect(text).toContain(REFERRALS[t].label);
    expect(text).toContain(REFERRALS[t].scope);
  });

  it("전체 목록에 세 곳이 다 들어간다", () => {
    const all = allReferralText();
    for (const t of topics) expect(all, t).toContain(REFERRALS[t].label);
  });
});
