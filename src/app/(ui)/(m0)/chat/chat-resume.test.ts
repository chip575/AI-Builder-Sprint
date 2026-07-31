// S2 · 대화 화면의 이어쓰기 (D-07 · FR-113)
//
// 이 서비스의 전제는 "세션 주기와 무관하게 이어쓴다"이다. 그런데 sessionId를
// 화면 상태로만 들고 있으면 **새로 들어온 순간 지난 이야기로 가는 길이 사라진다.**
// 실제로 그랬고, 화면을 열어 봐야만 드러났다. 그래서 소스 검사로 고정한다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(ui)/(m0)/chat/page.tsx", "utf-8");

describe("S2 — 다시 들어와도 이어진다", () => {
  it("세션 id를 브라우저에 남기고 마운트 때 되살린다", () => {
    expect(page).toContain("localStorage.setItem(SESSION_KEY");
    expect(page).toContain("localStorage.getItem(SESSION_KEY)");
  });

  it("확인 버튼이 이번 대화 길이에만 매이지 않는다", () => {
    // `turns.length >= 2` 하나만 걸려 있으면 돌아온 사람에게는 버튼이 없다
    expect(page).toContain("turns.length >= 2 || resumed");
  });

  it("새로 시작할 길도 준다 — 이어쓰기가 강제가 되면 안 된다 (P4)", () => {
    expect(page).toContain("localStorage.removeItem(SESSION_KEY)");
    expect(page).toContain("새로 시작할게요");
  });
});

describe("S2 — 저장되고 있다는 것이 보인다", () => {
  it("서버가 준 커버리지를 그대로 쓴다 — 화면이 세지 않는다", () => {
    // 화면이 자체 계산하면 서버가 아는 것과 갈라진다 (confirmedAt과 같은 원칙)
    expect(page).toContain("m.axisCoverage");
    expect(page).toContain("가지 이야기가 정리되어 있습니다");
  });

  it("브라우저에 남기는 것은 식별자뿐이다 — 내용은 서버에 있다 (보안 1조)", () => {
    // 발화 원문을 localStorage에 넣으면 그 순간 개인정보가 단말에 남는다
    expect(page).not.toMatch(/localStorage\.setItem\(\s*["'][^"']*turns/);
    expect(page).toContain("세션 id뿐이다");
  });
});
