// M-EVAL — 검증 픽스처 통과율 측정 (D-08 / ADR-7)
//
// "검증 모델을 의견이 아니라 측정으로 정했다"를 증명하는 산출물이다.
// 결과(eval/results.json)를 레포에 커밋해 재현 가능한 증거로 삼는다.
//
// 두 종류의 검사를 **의도적으로 나눈다**:
//   · checker=llm   — 누락·모순처럼 대화를 읽어야 아는 것. Solar가 판정한다
//   · checker=rules — 거주지 제약·답례품 한도처럼 **법이 정한 것**. 룰테이블이 판정한다
// 법률 제약을 LLM에 묻지 않는 이유는 P3다. 프롬프트에 법률 수치를 넣는 순간
// 그 수치의 출처가 코드가 아니라 프롬프트가 되고, 근거를 댈 수 없게 된다.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkRewardLimit } from "../src/lib/rules/hometown-donation.ts";

const FIXTURE_DIR = "eval/fixtures";
// 출력 경로를 바꿀 수 있게 둔다 — 테스트가 mock으로 돌면서 실측 결과를 덮어쓰면
// 커밋된 증거가 "키 없이 돌린 기록"으로 바뀐다. 그건 증거의 훼손이다.
const OUT = process.env.EVAL_OUT ?? "eval/results.json";
const MODEL = "solar-pro3";
const THRESHOLD = 0.9; // 팀 임계 — 미달이면 경고만 한다. 모델 전환은 사람이 정한다

/** 결함 어휘. 모델이 자유 서술하면 채점이 불가능해지므로 열거형으로 고정한다. */
const DEFECTS = [
  "AMOUNT_MISSING",
  "AMOUNT_CONFLICT",
  "ORG_MISSING",
  "ORG_CONFLICT",
  "PERIOD_MISSING",
  "PERIOD_REVERSED",
  "BENEFICIARY_CONFLICT",
];

// 수치·법령이 한 글자도 없다 (P3). "무엇이 빠졌나 / 무엇이 어긋나나"만 묻는다.
const SYSTEM_PROMPT = `너는 기부·유산 약정 서류를 만들기 직전에 대화를 검토하는 검증기다.
사용자의 발화만 근거로 판단한다. 추측하거나 값을 지어내지 않는다.

찾을 것은 두 가지다.
1) 누락 — 서류에 반드시 있어야 할 항목을 사용자가 끝내 말하지 않았다
2) 모순 — 같은 항목을 서로 다르게 말했고, 뒤의 말이 앞의 말을 **정정한 것이 아니다**

⚠ 사용자가 "아니", "말고", "취소하고" 같은 표현으로 **명시적으로 고쳐 말한 경우는
모순이 아니다.** 최신 값을 쓰면 되므로 결함으로 보고하지 않는다.
결함이 없으면 빈 배열을 반환한다. 없는 결함을 만들어내지 않는다.`;

function loadFixtures() {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(FIXTURE_DIR, f), "utf-8")));
}

function envFromDotenv(key) {
  try {
    const m = readFileSync(".env", "utf-8").match(new RegExp(`^${key}=(.*)$`, "m"));
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

/** 법률 제약은 룰테이블이 판정한다 — 결정론적이고 근거 조문이 붙는다 */
function runRulesCase(fx) {
  const r = fx.rules;
  if (r.fn === "regionSelf") {
    // 고향사랑기부는 거주지에 할 수 없다. 판정은 문자열 비교이고
    // 근거는 룰테이블에 있다 — 여기서 법령을 재해석하지 않는다.
    return r.residence === r.target ? ["REGION_SELF"] : [];
  }
  if (r.fn === "rewardLimit") {
    const v = checkRewardLimit(r.donationAmount, r.selectedTotal);
    return v.overLimit ? ["REWARD_LIMIT_EXCEEDED"] : [];
  }
  throw new Error(`알 수 없는 rules.fn: ${r.fn}`);
}

async function runLlmCase(fx, apiKey) {
  const body = {
    model: MODEL,
    reasoning_effort: "high", // 검증은 추론이 필요하다 (구조화의 minimal과 다르다)
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "verification",
        schema: {
          type: "object",
          properties: {
            defects: { type: "array", items: { type: "string", enum: DEFECTS } },
          },
          required: ["defects"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        // 어떤 항목이 필요한지는 **코드가 안다**(가지별 필수 슬롯). 그걸 알려주지 않으면
        // 모델은 일회성 기부에도 "기간 누락"을 붙인다 — 실제로 그렇게 나왔다.
        // 항목 이름만 넘긴다. 한도·공제율 같은 수치는 넘기지 않는다 (P3).
        content:
          `이 서류에 필요한 항목: ${(fx.required ?? []).join(", ")}\n` +
          `목록에 없는 항목은 이 서류에 필요하지 않다 — 누락으로 보고하지 않는다.\n\n` +
          `사용자 발화:\n${fx.utterances.map((u) => `- ${u}`).join("\n")}`,
      },
    ],
  };

  // 타임아웃이 없으면 한 건이 매달릴 때 측정 전체가 멈춘다.
  // reasoning_effort=high는 느리므로 넉넉히 주되, 무한정 기다리지는 않는다.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 180_000);
  let res;
  try {
    res = await fetch("https://api.upstage.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
  return Array.isArray(parsed.defects) ? parsed.defects : [];
}

const same = (a, b) => {
  const x = [...new Set(a)].sort();
  const y = [...new Set(b)].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

async function main() {
  const fixtures = loadFixtures();
  const mode = (process.env.UPSTAGE_MODE ?? envFromDotenv("UPSTAGE_MODE") ?? "mock").trim();
  const apiKey = process.env.UPSTAGE_API_KEY ?? envFromDotenv("UPSTAGE_API_KEY");
  const llmLive = mode === "real" && Boolean(apiKey);

  if (!llmLive) {
    // 키 없이도 실행이 끝나야 한다 (NFR-707) — 에러가 아니라 "측정 안 함"이다
    console.log("[eval] UPSTAGE 키/모드 없음 — LLM 케이스는 skipped로 기록합니다.");
  }

  const cases = [];
  for (const fx of fixtures) {
    const expected = fx.expected.defects;
    let detected = null;
    let status = "skipped";
    let error = null;

    try {
      if (fx.checker === "rules") {
        detected = runRulesCase(fx);
        status = same(detected, expected) ? "pass" : "fail";
      } else if (llmLive) {
        detected = await runLlmCase(fx, apiKey);
        status = same(detected, expected) ? "pass" : "fail";
      }
    } catch (err) {
      status = "error";
      error = err.message.slice(0, 200); // 키가 섞일 수 있는 원문은 자른다
    }

    // 거짓 양성 — 결함이 없어야 하는데 만들어낸 경우. 실패로 집계한다
    const falsePositive = expected.length === 0 && (detected?.length ?? 0) > 0;

    cases.push({
      id: fx.id,
      title: fx.title,
      checker: fx.checker,
      expected,
      detected,
      falsePositive,
      status,
      ...(error ? { error } : {}),
    });
    const mark = { pass: "✓", fail: "✗", error: "!", skipped: "-" }[status];
    console.log(`  ${mark} ${fx.id.padEnd(24)} ${fx.title}`);
  }

  const scored = cases.filter((c) => c.status !== "skipped");
  const passed = scored.filter((c) => c.status === "pass").length;
  const rate = scored.length ? passed / scored.length : 0;
  const falsePositives = cases.filter((c) => c.falsePositive).length;

  const results = {
    runAt: new Date().toISOString(),
    model: MODEL,
    mode: llmLive ? "real" : "mock",
    total: cases.length,
    scored: scored.length,
    passed,
    rate: Number(rate.toFixed(3)),
    falsePositives,
    cases,
  };
  writeFileSync(OUT, JSON.stringify(results, null, 2) + "\n", "utf-8");

  console.log(
    `\n채점 ${passed}/${scored.length} (${(rate * 100).toFixed(1)}%) · 거짓 양성 ${falsePositives}건 · ${OUT}`,
  );
  if (scored.length && rate < THRESHOLD) {
    // 경고만 한다. 모델 전환은 사람이 결정한다 — 스크립트가 바꾸지 않는다
    console.warn(
      `[eval] ⚠ 통과율이 임계(${THRESHOLD * 100}%) 미만입니다. 모델·프롬프트 재검토가 필요한지 사람이 판단하세요.`,
    );
  }
}

await main();
