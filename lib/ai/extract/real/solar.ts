// realExtractor — Solar structured output (D-06 · 02.5 §2)
//
// 근거 문서 (2026-07-30 확인):
//  · POST https://api.upstage.ai/v1/chat/completions
//    https://console.upstage.ai/api/docs/for-agents/raw
//  · 인증 Authorization: Bearer · 모델 solar-pro3
//  · response_format: { type: "json_schema", json_schema: { name, schema } }
//  · reasoning_effort: 구조화는 minimal (02.5 §4 — 비용·지연 억제)
//  · 응답 본문: choices[0].message.content (JSON 문자열)
//
// ⚠ confidence는 모델에게 묻지 않는다 (D-08 전제 유지).
//    모델은 값과 근거 발화만 주고, 신뢰도는 우리 정규화 계층이 소유한다 —
//    모델이 confidence를 주기 시작해도 인터페이스는 바뀌지 않는다.
// ⚠ 프롬프트에 법률 수치를 넣지 않는다 (P3). 계산은 lib/rules가 한다.
import { randomUUID } from "node:crypto";
import type { IntentFact, IntentFactList } from "../../../contracts/extract";
import { IntentFactList as IntentFactListSchema } from "../../../contracts/extract";
import type { Utterance } from "../../session/store";
import { CONFIDENCE } from "../confidence";
import { parseAmount } from "../parse-amount";
import type { ExtractInput, ExtractorPort } from "../port";
import { requiredSlotsFor } from "../mock-extractor";

export const UPSTAGE_BASE = "https://api.upstage.ai/v1";
export const SOLAR_MODEL = "solar-pro3";

/** 슬롯 설명 — 값의 형태만 알려준다. 법률 수치·한도·공제율은 등장하지 않는다 (P3) */
const SLOT_HINTS: Record<string, string> = {
  region: "기부 대상 지역(광역 지자체명). 예: 부산",
  amount: "기부 금액(원 단위 정수). 사용자가 어림수로 말했어도 숫자로 옮긴다",
  orgName: "후원 대상 기관·유산의 이름",
};

const SYSTEM_PROMPT = [
  "너는 대화에서 사용자가 말한 사실만 뽑아내는 추출기다.",
  "규칙:",
  "1. 사용자가 말하지 않은 값은 만들지 않는다. 없으면 그 항목을 생략한다.",
  "2. 각 항목에는 근거가 된 사용자 발화의 원문 조각(sourceText)을 그대로 옮긴다.",
  "3. 값을 추천하거나 제안하지 않는다. 금액·대상을 네가 정하지 않는다.",
  "4. 계산하지 않는다. 세금·공제·한도는 다른 곳에서 처리한다.",
  "5. 같은 항목을 여러 번 말했으면 가장 나중 발화를 따른다.",
].join("\n");

/** 모델 출력 스키마 — confidence는 요구하지 않는다 (위 주석 참조) */
function jsonSchema(slots: string[]) {
  return {
    name: "intent_facts",
    schema: {
      type: "object",
      properties: {
        facts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string", enum: slots },
              value: { type: ["string", "number"] },
              sourceText: { type: "string" },
            },
            required: ["key", "value", "sourceText"],
            additionalProperties: false,
          },
        },
      },
      required: ["facts"],
      additionalProperties: false,
    },
  };
}

interface ModelFact {
  key: string;
  value: string | number;
  sourceText: string;
}

export interface SolarOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  model?: string;
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class SolarExtractor implements ExtractorPort {
  private fetchImpl: typeof fetch;
  private base: string;
  private model: string;
  private maxRetries: number;
  private timeoutMs: number;
  private sleep: (ms: number) => Promise<void>;

  constructor(private opts: SolarOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = opts.baseUrl ?? UPSTAGE_BASE;
    this.model = opts.model ?? SOLAR_MODEL;
    this.maxRetries = opts.maxRetries ?? 2;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /**
   * 신뢰도 산출 — 모델이 아니라 우리가 정한다 (D-08).
   * 근거 발화에 숫자가 명시돼 있으면 HIGH, 수사·어림 표현을 해석했으면 MEDIUM,
   * 근거를 대화에서 못 찾으면 LOW(항상 되묻는다).
   */
  private confidenceFor(key: string, value: unknown, sourceText: string, found: boolean): number {
    if (!found) return CONFIDENCE.LOW;
    if (key === "amount") {
      const parsed = parseAmount(sourceText);
      if (!parsed || parsed.value !== value) return CONFIDENCE.LOW; // 근거와 값이 불일치
      return parsed.source === "EXPLICIT" ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM;
    }
    return CONFIDENCE.HIGH;
  }

  private async call(body: unknown): Promise<string> {
    let lastError = "";
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(`${this.base}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.opts.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (res.ok) {
          const json = (await res.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const content = json.choices?.[0]?.message?.content;
          if (!content) throw new Error("빈 응답");
          return content;
        }
        lastError = `${res.status} ${await res.text().catch(() => "")}`.slice(0, 300);
        if (!(res.status === 429 || res.status >= 500) || attempt === this.maxRetries) break;
      } catch (err) {
        lastError = (err as Error).message;
        if (attempt === this.maxRetries) break;
      } finally {
        clearTimeout(timer);
      }
      await this.sleep(2 ** attempt * 500);
    }
    // mock으로 조용히 떨어지지 않는다 (보안 7조) — 라우트가 사용자 문구로 번역한다
    throw new Error(`[extract:solar] 호출 실패: ${lastError}`);
  }

  async extract(input: ExtractInput): Promise<IntentFactList> {
    const slots = requiredSlotsFor(input.branchType);
    const active = slots.length > 0 ? slots : ["region", "amount", "orgName"];

    const transcript = input.utterances.map((u) => `- ${u.text}`).join("\n");
    const slotList = active
      .map((s) => `- ${s}: ${SLOT_HINTS[s] ?? "사용자가 말한 값"}`)
      .join("\n");

    const content = await this.call({
      model: this.model,
      reasoning_effort: "minimal", // 구조화는 추론 불필요 (02.5 §4)
      response_format: { type: "json_schema", json_schema: jsonSchema(active) },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `뽑을 항목:\n${slotList}\n\n사용자 발화:\n${transcript}`,
        },
      ],
    });

    // 1차 방어 — json_schema를 써도 출력이 스키마를 어길 수 있다
    let parsed: { facts?: ModelFact[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("[extract:solar] 응답이 JSON이 아닙니다");
    }

    const byKey = new Map<string, IntentFact>();
    for (const f of parsed.facts ?? []) {
      if (!active.includes(f.key)) continue; // 요청하지 않은 슬롯은 버린다
      const source = findSpan(input.utterances, f.sourceText);
      byKey.set(f.key, {
        id: randomUUID(),
        key: f.key,
        value: f.value,
        confidence: this.confidenceFor(f.key, f.value, f.sourceText, source !== null),
        sourceSpan: source,
        confirmed: false, // AI 산출물은 항상 미확정으로 시작 (P1)
      });
    }

    // 2차 방어 — 계약으로 재검증한다. 실패하면 조용히 통과시키지 않는다
    return IntentFactListSchema.parse({
      facts: [...byKey.values()],
      missingRequired: slots.filter((k) => !byKey.has(k)),
    });
  }
}

/** 모델이 준 근거 문구를 실제 발화에서 찾아 위치를 붙인다. 못 찾으면 null → LOW */
function findSpan(utterances: Utterance[], sourceText: string) {
  const needle = sourceText.trim();
  if (!needle) return null;
  for (const u of utterances) {
    const start = u.text.indexOf(needle);
    if (start >= 0) {
      return {
        utteranceId: u.id,
        start,
        end: start + needle.length,
        text: u.text.slice(start, start + needle.length),
      };
    }
  }
  return null;
}
