// M-EVAL 테스트 (D-08 / ADR-7)
// 이 스위트가 지키는 것은 "eval이 돌아간다"가 아니라 **"측정이 정직하다"**이다.
// 픽스처가 스키마를 지키는지, 정상 케이스가 실제로 정상인지, 그리고
// 프롬프트에 법률 수치가 섞이지 않았는지(P3)를 고정한다.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = "eval/fixtures";
const MOCK_OUT = join(tmpdir(), "namgida-eval-mock.json");
const fixtures = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf-8")));

describe("M-EVAL — 픽스처", () => {
  it("12케이스이고 id가 중복되지 않는다", () => {
    expect(fixtures).toHaveLength(12);
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(12);
  });

  it("모든 픽스처가 스키마를 만족한다", () => {
    for (const f of fixtures) {
      expect(typeof f.id).toBe("string");
      expect(typeof f.title).toBe("string");
      expect(["llm", "rules"]).toContain(f.checker);
      expect(Array.isArray(f.expected?.defects)).toBe(true);
      if (f.checker === "llm") {
        expect(Array.isArray(f.utterances)).toBe(true);
        expect(f.utterances.length).toBeGreaterThan(0);
      } else {
        expect(typeof f.rules?.fn).toBe("string");
      }
    }
  });

  it("정상 케이스가 둘 있다 — 거짓 양성을 재는 자리다", () => {
    // 결함 케이스만 있으면 "전부 결함이라고 답하는 모델"이 만점을 받는다
    const clean = fixtures.filter((f) => f.expected.defects.length === 0);
    expect(clean.length).toBeGreaterThanOrEqual(2);
  });

  it("법률 제약 케이스는 rules가 판정한다 — LLM에 묻지 않는다 (P3)", () => {
    const byId = new Map(fixtures.map((f) => [f.id, f]));
    expect(byId.get("08-region-self")!.checker).toBe("rules");
    expect(byId.get("09-reward-limit")!.checker).toBe("rules");
  });

  it("픽스처에 실존 인물·실계좌 패턴이 없다 (NFR-714 4조)", () => {
    const all = JSON.stringify(fixtures);
    expect(all).not.toMatch(/\d{6}-\d{7}/); // 주민등록번호 형태
    expect(all).not.toMatch(/\d{3}-\d{2,3}-\d{5,6}/); // 계좌 형태
  });
});

describe("M-EVAL — 프롬프트 (P3)", () => {
  const runner = readFileSync("eval/run.mjs", "utf-8");
  const prompt = runner.slice(
    runner.indexOf("const SYSTEM_PROMPT"),
    runner.indexOf("function loadFixtures"),
  );

  it("검증 프롬프트에 법률 수치·조문이 없다", () => {
    // 프롬프트에 수치를 넣으면 그 수치의 출처가 코드가 아니라 프롬프트가 된다
    expect(prompt).not.toMatch(/\d+\s*%/);
    expect(prompt).not.toMatch(/\d{3,}\s*원/);
    expect(prompt).not.toMatch(/민법|조세특례|제\s*\d+\s*조/);
  });

  it("정정과 모순을 구분하라고 명시한다", () => {
    // 3번 케이스(명시적 정정)를 모순으로 세면 거짓 양성이 된다
    expect(prompt).toContain("정정");
  });
});

describe("M-EVAL — 실행기", () => {
  it("키 없이도 에러 없이 끝난다 (NFR-707)", () => {
    const out = execFileSync("node", ["eval/run.mjs"], {
      encoding: "utf-8",
      // 실측 결과(eval/results.json)를 덮어쓰지 않는다 — 커밋된 증거를 지키는 자리다
      env: {
        ...process.env,
        UPSTAGE_MODE: "mock",
        UPSTAGE_API_KEY: "",
        EVAL_OUT: MOCK_OUT,
      },
      timeout: 60_000,
    });
    expect(out).toContain("채점");
  });

  it("results.json이 유효하고 필수 키를 갖는다", () => {
    expect(existsSync("eval/results.json")).toBe(true);
    const r = JSON.parse(readFileSync("eval/results.json", "utf-8"));
    for (const k of ["runAt", "model", "mode", "total", "passed", "rate", "falsePositives", "cases"]) {
      expect(r).toHaveProperty(k);
    }
    expect(r.cases).toHaveLength(12);
    // 결과에 키가 섞여 나가면 커밋하는 순간 유출이다
    expect(JSON.stringify(r)).not.toMatch(/up_[A-Za-z0-9]{10,}/);
  });

  it("mock 모드에서도 법률 제약 2건은 실제로 채점된다", () => {
    const r = JSON.parse(readFileSync(MOCK_OUT, "utf-8"));
    const rules = r.cases.filter((c: { checker: string }) => c.checker === "rules");
    expect(rules).toHaveLength(2);
    for (const c of rules) expect(c.status).not.toBe("skipped");
  });
});
