// S2 · 대화 화면의 이어쓰기 (D-07 · FR-113)
//
// 이 서비스의 전제는 "세션 주기와 무관하게 이어쓴다"이다. 그런데 sessionId를
// 화면 상태로만 들고 있으면 **새로 들어온 순간 지난 이야기로 가는 길이 사라진다.**
// 실제로 그랬고, 화면을 열어 봐야만 드러났다. 그래서 소스 검사로 고정한다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(ui)/(m0)/chat/page.tsx", "utf-8");
// 곁칸을 이동용(NavSidebar)으로 통일하면서 대화 맥락은 다시 본문으로 돌아왔다.
// 문장은 한 줄로 줄었지만 "세어주되 분모는 없다"는 규칙은 그대로다.

describe("S2 — 다시 들어와도 이어진다", () => {
  it("세션 id를 브라우저에 남기고 마운트 때 되살린다", () => {
    expect(page).toContain("localStorage.setItem(SESSION_KEY");
    expect(page).toContain("localStorage.getItem(SESSION_KEY)");
  });

  it("확인 버튼이 이번 대화 길이에만 매이지 않는다", () => {
    // `turns.length >= 2` 하나만 걸려 있으면 돌아온 사람에게는 버튼이 없다.
    // 개편 후 기준은 서버가 아는 이야기 수다 — 이번 대화(covered)가 없으면
    // 지난 세션(savedCount)이 대신한다. 화면 상태(turns)에 매이지 않는 것이 요점.
    expect(page).toContain("covered ?? savedCount");
    expect(page).not.toMatch(/turns\.length\s*>=\s*\d+\s*(\|\||&&)/);
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
    // 안내 문구는 본문 한 줄 요약으로 돌아왔다 — 위치는 옮겨도 세어주는 일은 지킨다
    expect(page).toContain("가지가 정리되어 있어요");
    // 분모·총량은 붙이지 않는다 (P4 · FR-111)
    expect(page).not.toMatch(/전체\s*\{/);
  });

  it("브라우저에 남기는 것은 식별자뿐이다 — 내용은 서버에 있다 (보안 1조)", () => {
    // 발화 원문을 localStorage에 넣으면 그 순간 개인정보가 단말에 남는다
    expect(page).not.toMatch(/localStorage\.setItem\(\s*["'][^"']*turns/);
    expect(page).toContain("세션 id뿐이다");
  });
});
