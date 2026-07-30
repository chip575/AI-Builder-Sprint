// realExtractor 테스트 — 네트워크 없이 요청 조립·응답 파싱·신뢰도 산출을 검증한다.
// 픽스처 발화는 **데모 대본 그대로** — 키 도착 후 같은 입력으로 mock vs real을
// 직접 대조할 수 있고, 그 대조가 ADR-7 측정(D-08)의 예행이 된다.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CONFIDENCE } from "../confidence";
import type { Utterance } from "../../session/store";
import { SolarExtractor } from "./solar";

const utt = (text: string): Utterance => ({
  id: randomUUID(),
  text,
  at: new Date().toISOString(),
});

// 데모 대본 발화
const SCRIPT = {
  intent: utt("부산에 기부하고 싶어요"),
  vague: utt("한 십만원쯤 생각해요"),
  correction: utt("아니, 30만원으로 할게요"),
};

interface Call {
  url: string;
  headers: Record<string, string>;
  body: any;
}

function stub(responses: { status: number; content?: unknown; raw?: string }[]) {
  const calls: Call[] = [];
  let i = 0;
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    const content = r.raw ?? JSON.stringify(r.content ?? { facts: [] });
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => ({ choices: [{ message: { content } }] }),
      text: async () => "err",
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const make = (impl: typeof fetch, extra = {}) =>
  new SolarExtractor({ apiKey: "up_test", fetchImpl: impl, sleep: async () => {}, ...extra });

const input = (...utterances: Utterance[]) => ({
  intentId: randomUUID(),
  branchType: "DONATION_NOW" as const,
  utterances,
});

describe("realExtractor — 요청 조립", () => {
  it("엔드포인트·Bearer·모델·reasoning_effort minimal·json_schema", async () => {
    const { impl, calls } = stub([{ status: 200, content: { facts: [] } }]);
    await make(impl).extract(input(SCRIPT.intent));

    const c = calls[0]!;
    expect(c.url).toBe("https://api.upstage.ai/v1/chat/completions");
    expect(c.headers.Authorization).toBe("Bearer up_test");
    expect(c.body.model).toBe("solar-pro3");
    expect(c.body.reasoning_effort).toBe("minimal"); // 02.5 §4
    expect(c.body.response_format.type).toBe("json_schema");
    expect(c.body.response_format.json_schema.schema.properties.facts).toBeDefined();
  });

  it("프롬프트에 법률 수치가 없다 (P3) — 스키마도 confidence를 요구하지 않는다", async () => {
    const { impl, calls } = stub([{ status: 200, content: { facts: [] } }]);
    await make(impl).extract(input(SCRIPT.intent, SCRIPT.vague));

    const sent = JSON.stringify(calls[0]!.body);
    // 금지 대상은 단어가 아니라 **수치**다 (gate:check 2번과 같은 기준).
    // "세금·공제·한도는 다른 곳에서 처리한다" 같은 계산 금지 지시는 오히려 있어야 한다.
    expect(sent).not.toMatch(/[0-9]+(\.[0-9]+)?%/); // 공제율·비율
    expect(sent).not.toMatch(/[0-9,]{4,}\s*원/); // 금액 상수
    expect(sent).not.toContain("16.5");
    expect(sent).not.toContain("2000만");
    // confidence는 모델에게 묻지 않는다 (D-08 전제 유지)
    const props = calls[0]!.body.response_format.json_schema.schema.properties.facts.items.properties;
    expect(Object.keys(props).sort()).toEqual(["key", "sourceText", "value"]);
  });
});

describe("realExtractor — 신뢰도는 우리가 정한다 (D-08)", () => {
  it("숫자 명시 발화 → HIGH + sourceSpan 부착", async () => {
    const u = utt("100만원이요");
    const { impl } = stub([
      { status: 200, content: { facts: [{ key: "amount", value: 1_000_000, sourceText: "100만원" }] } },
    ]);
    const r = await make(impl).extract(input(SCRIPT.intent, u));
    const amount = r.facts.find((f) => f.key === "amount")!;
    expect(amount.confidence).toBe(CONFIDENCE.HIGH);
    expect(amount.sourceSpan?.text).toBe("100만원");
    expect(amount.confirmed).toBe(false); // P1
  });

  it("어림 표현 → MEDIUM (되묻기 대상)", async () => {
    const { impl } = stub([
      { status: 200, content: { facts: [{ key: "amount", value: 100_000, sourceText: "한 십만원쯤" }] } },
    ]);
    const r = await make(impl).extract(input(SCRIPT.intent, SCRIPT.vague));
    expect(r.facts.find((f) => f.key === "amount")!.confidence).toBe(CONFIDENCE.MEDIUM);
  });

  it("근거를 대화에서 못 찾으면 LOW — 환각 방어", async () => {
    const { impl } = stub([
      { status: 200, content: { facts: [{ key: "region", value: "서울", sourceText: "서울에 하고 싶어요" }] } },
    ]);
    const r = await make(impl).extract(input(SCRIPT.intent));
    const region = r.facts.find((f) => f.key === "region")!;
    expect(region.confidence).toBe(CONFIDENCE.LOW);
    expect(region.sourceSpan).toBeNull();
  });

  it("근거와 값이 어긋나면 LOW (금액을 지어낸 경우)", async () => {
    const { impl } = stub([
      { status: 200, content: { facts: [{ key: "amount", value: 9_999_999, sourceText: "한 십만원쯤" }] } },
    ]);
    const r = await make(impl).extract(input(SCRIPT.intent, SCRIPT.vague));
    expect(r.facts.find((f) => f.key === "amount")!.confidence).toBe(CONFIDENCE.LOW);
  });

  it("정정 발화 — 같은 key는 나중 것이 이긴다 (mock과 동일 규칙)", async () => {
    const { impl } = stub([
      {
        status: 200,
        content: {
          facts: [
            { key: "amount", value: 100_000, sourceText: "한 십만원쯤" },
            { key: "amount", value: 300_000, sourceText: "30만원" },
          ],
        },
      },
    ]);
    const r = await make(impl).extract(
      input(SCRIPT.intent, SCRIPT.vague, SCRIPT.correction),
    );
    expect(r.facts.filter((f) => f.key === "amount")).toHaveLength(1);
    expect(r.facts.find((f) => f.key === "amount")!.value).toBe(300_000);
  });
});

describe("realExtractor — 방어", () => {
  it("요청하지 않은 슬롯은 버린다", async () => {
    const { impl } = stub([
      { status: 200, content: { facts: [{ key: "secretField", value: "x", sourceText: "부산" }] } },
    ]);
    const r = await make(impl).extract(input(SCRIPT.intent));
    expect(r.facts).toHaveLength(0);
  });

  it("빠진 필수 슬롯은 missingRequired로 보고된다", async () => {
    const { impl } = stub([
      { status: 200, content: { facts: [{ key: "region", value: "부산", sourceText: "부산" }] } },
    ]);
    const r = await make(impl).extract(input(SCRIPT.intent));
    expect(r.missingRequired).toEqual(["amount"]);
  });

  it("JSON이 아닌 응답 → 명시적 실패 (mock 폴백 금지)", async () => {
    const { impl } = stub([{ status: 200, raw: "죄송합니다, 잘 모르겠어요" }]);
    await expect(make(impl).extract(input(SCRIPT.intent))).rejects.toThrow(/JSON/);
  });

  it("5xx는 재시도 후 명시적 실패", async () => {
    const { impl, calls } = stub([{ status: 503 }]);
    await expect(make(impl, { maxRetries: 1 }).extract(input(SCRIPT.intent))).rejects.toThrow(
      /extract:solar/,
    );
    expect(calls).toHaveLength(2);
  });
});
