// SolarDetector — 대화 중 가지 신호 분류 (FR-115A · 02.5 §2)
//
// 근거 문서는 lib/ai/extract/real/solar.ts 머리말과 같다 (같은 엔드포인트·인증).
//  · reasoning_effort: 분류는 minimal (02.5 §4 — 비용·지연 억제)
//  · response_format: json_schema
//
// ⚠ 모델에게 묻지 않는 것 두 가지:
//    ① 무게 등급 — lib/rules/branch-weight.ts가 정한다
//    ② 제안 문구 — 확인형 문구는 propose.ts의 고정 표다 (NFR-708을 모델에 맡기지 않는다)
//    모델은 "어떤 가지 신호가, 어느 발화에" 있었는지만 말한다.
// ⚠ 타임아웃 필수 (D-19) — 없으면 대화 스트림이 조용히 매달린다.
import { BranchType } from "../../../contracts/common";
import type { Utterance } from "../../session/store";
import type { BranchSignal, DetectInput, DetectorPort } from "../port";

export const UPSTAGE_BASE = "https://api.upstage.ai/v1";
export const SOLAR_MODEL = "solar-pro3";

const SYSTEM_PROMPT = [
  "너는 대화에서 '법적 서류로 이어질 수 있는 신호'만 골라내는 분류기다.",
  "규칙:",
  "1. 마지막 발화에 그 신호가 드러났을 때만 보고한다. 없으면 빈 배열이다.",
  "2. 신호의 근거가 된 사용자 발화의 원문 조각(sourceText)을 그대로 옮긴다.",
  "3. 권유하지 않는다. 사용자를 설득할 문장을 만들지 않는다.",
  "4. 등급·경중·긴급도를 판단하지 않는다. 그건 네 일이 아니다.",
  "5. 추측하지 않는다. 사용자가 말하지 않은 의사를 채워 넣지 않는다.",
].join("\n");

/** 가지 뜻풀이 — 값의 뜻만 알려준다. 법률 수치는 등장하지 않는다 (P3) */
const BRANCH_HINTS: Record<string, string> = {
  DONATION_NOW: "지금 하는 기부·성금·후원",
  HERITAGE_SUPPORT: "문화유산·문화재 후원",
  LEGACY_GIFT: "세상을 떠난 뒤에 남기는 기부(유산 기부)",
  HANDWRITTEN_WILL: "유언장을 쓰려는 뜻",
  ESTATE: "자산·재산을 정리하거나 목록으로 만들려는 뜻",
};

const JSON_SCHEMA = {
  name: "branch_signals",
  schema: {
    type: "object",
    properties: {
      signals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            branchType: { type: "string", enum: BranchType.options },
            sourceText: { type: "string" },
          },
          required: ["branchType", "sourceText"],
          additionalProperties: false,
        },
      },
    },
    required: ["signals"],
    additionalProperties: false,
  },
};

interface ModelSignal {
  branchType: string;
  sourceText: string;
}

export interface SolarDetectorOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  model?: string;
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class SolarDetector implements DetectorPort {
  private fetchImpl: typeof fetch;
  private base: string;
  private model: string;
  private maxRetries: number;
  private timeoutMs: number;
  private sleep: (ms: number) => Promise<void>;

  constructor(private opts: SolarDetectorOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = opts.baseUrl ?? UPSTAGE_BASE;
    this.model = opts.model ?? SOLAR_MODEL;
    this.maxRetries = opts.maxRetries ?? 1; // 대화 중 호출이다 — 길게 물고 있지 않는다
    this.timeoutMs = opts.timeoutMs ?? 4_000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
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
      await this.sleep(2 ** attempt * 300);
    }
    // mock으로 조용히 떨어지지 않는다 (보안 7조) — 호출부가 제안 없이 진행한다
    throw new Error(`[branch:solar] 호출 실패: ${lastError}`);
  }

  async detect(input: DetectInput): Promise<BranchSignal[]> {
    const latest = input.utterances[input.utterances.length - 1];
    if (!latest) return [];

    // 맥락은 주되 판정 대상은 마지막 발화 하나다
    const context = input.utterances
      .slice(-6, -1)
      .map((u) => `- ${u.text}`)
      .join("\n");
    const kinds = BranchType.options
      .map((k) => `- ${k}: ${BRANCH_HINTS[k]}`)
      .join("\n");

    const content = await this.call({
      model: this.model,
      reasoning_effort: "minimal",
      response_format: { type: "json_schema", json_schema: JSON_SCHEMA },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `가지 종류:\n${kinds}`,
            context ? `앞선 대화:\n${context}` : "앞선 대화: (없음)",
            `방금 한 발화:\n${latest.text}`,
          ].join("\n\n"),
        },
      ],
    });

    let parsed: { signals?: ModelSignal[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("[branch:solar] 응답이 JSON이 아닙니다");
    }

    const byType = new Map<string, BranchSignal>();
    for (const s of parsed.signals ?? []) {
      const kind = BranchType.safeParse(s.branchType);
      if (!kind.success) continue; // 계약 밖 가지 이름은 버린다
      const sourceUtteranceId = findUtteranceId(input.utterances, s.sourceText);
      // 근거를 실제 발화에서 못 찾으면 신호를 버린다 — 지어낸 근거의 자리를 없앤다.
      // (제안 단계도 같은 검사를 한 번 더 한다. 방어선은 둘이다)
      if (!sourceUtteranceId) continue;
      byType.set(kind.data, { branchType: kind.data, sourceUtteranceId });
    }
    return [...byType.values()];
  }
}

/** 모델이 준 근거 문구를 실제 발화에서 찾는다. 못 찾으면 null */
function findUtteranceId(utterances: Utterance[], sourceText: string): string | null {
  const needle = sourceText.trim();
  if (!needle) return null;
  for (const u of utterances) {
    if (u.text.includes(needle)) return u.id;
  }
  return null;
}
