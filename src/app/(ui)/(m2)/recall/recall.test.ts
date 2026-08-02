// S-RECALL 화면 테스트 (FR-301 · FR-110)
// 이 화면의 핵심은 "한 번에 하나만 묻는다"와 "문장을 화면이 정하지 않는다"이다.
// 둘 다 소스 검사로 고정한다 — 렌더 테스트로는 "질문이 둘 늘어난 것"을 놓치기 쉽다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAUSE_PROMPT, QUESTIONS } from "@/lib/rules/question-bank";

const page = readFileSync("src/app/(ui)/(m2)/recall/page.tsx", "utf-8");

describe("S-RECALL — 1화면 1질문", () => {
  it("질문 렌더 지점이 하나뿐이다", () => {
    // question.text를 두 곳에서 그리면 설문지가 된다
    expect(page.match(/\{question\.text\}/g)).toHaveLength(1);
  });

  it("질문 문장을 화면이 들고 있지 않다 — 룰테이블에서 온다", () => {
    for (const q of QUESTIONS) expect(page).not.toContain(q.text);
    expect(page).toContain('from "@/lib/rules/question-bank"');
  });
});

describe("S-RECALL — 수락 기준", () => {
  it("건너뛰기가 있고, 건너뛴 질문을 skippedIds로 넘긴다", () => {
    expect(page).toContain("건너뛸게요");
    expect(page).toContain("skippedIds");
  });

  it("머무름 문구를 화면이 짓지 않는다 (PAUSE_PROMPT 사용)", () => {
    expect(page).toContain("PAUSE_PROMPT.message");
    expect(page).not.toContain(PAUSE_PROMPT.message); // 하드코딩 금지
  });

  it("재촉 어휘가 화면에 없다 (NFR-708)", () => {
    for (const w of ["빨리", "서둘러", "지금 바로", "마감", "얼마 남지"]) {
      expect(page).not.toContain(w);
    }
  });

  it("커버리지를 화면이 세지 않는다 — 안 쓰기로 한 결정도 소스에 남는다", () => {
    // 개편(6fb711a)으로 화면은 커버리지를 표시하지 않는다. "화면이 자체 계산하지
    // 않는다"는 원 의도는 그대로 지키고, 결정의 흔적(주석)이 지워지면 여기서 잡혀
    // 다시 논의하게 한다. 표시를 되살릴 때는 서버 meta 값을 그대로 써야 한다.
    expect(page).toContain("화면은 쓰지 않는다");
    expect(page).not.toMatch(/axisCoverage\s*\.\s*(map|reduce|filter)/);
  });
});
