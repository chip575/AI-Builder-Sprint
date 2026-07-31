// 화면 공통 규칙 (02.1.1 · P4 · NFR-705)
// 막다른 화면을 만들지 않는다 — 들어간 곳에서 나올 길이 항상 있어야 한다.
// 실제로 확인 화면에 돌아가는 길이 없었고, 필수 항목이 비면 버튼까지 죽어
// **회색 버튼만 남은 화면**이 됐다. 그 조합을 여기서 막는다.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sep } from "node:path";
import { describe, expect, it } from "vitest";

function pages(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...pages(p));
    else if (e.name === "page.tsx") out.push(p);
  }
  return out;
}

const ALL = pages("src/app/(ui)");

describe("Shell — 나가는 길", () => {
  it("모든 화면이 Shell을 쓴다 — 중단 링크가 전 화면에 있어야 한다 (P4)", () => {
    // 홈은 예외다 — 자기 자신으로 나가는 링크는 뜻이 없다. 그 하나만 뺀다
    const HOME = ["src/app/(ui)/page.tsx".replace(/\//g, sep)];
    for (const p of ALL.filter((f) => !HOME.includes(f))) {
      const src = readFileSync(p, "utf-8");
      expect(src, p).toContain("<Shell");
    }
  });

  it("Shell이 이전 화면으로 가는 자리를 제공한다", () => {
    const shell = readFileSync("src/app/(ui)/_components/Shell.tsx", "utf-8");
    expect(shell).toContain("back?:");
    // 중단(홈)과 되돌아가기는 다른 문이다
    expect(shell).toContain("나중에 생각할래요");
  });
});

describe("확인 화면 — 회색 버튼만 남지 않는다", () => {
  const src = readFileSync("src/app/(ui)/(m0)/confirm/page.tsx", "utf-8");

  it("확인 버튼을 미완 상태로 죽이지 않는다", () => {
    // disabled={busy || missingRequired.length > 0} 이면 무엇을 해야 할지 알 수 없다
    expect(src).not.toMatch(/disabled=\{busy \|\| sheet\.missingRequired/);
  });

  it("누르면 무엇이 비었는지와 다음 행동을 알려준다 (NFR-705)", () => {
    expect(src).toContain("nextAction");
    expect(src).toContain("대화로 돌아가");
  });
});
