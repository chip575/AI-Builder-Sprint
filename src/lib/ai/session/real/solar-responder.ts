// real 대화 응답 — Solar 스트리밍 (FR-101 · 02.5 §2)
//
// 근거: https://console.upstage.ai/api/docs/for-agents/raw (2026-07-30 확인)
//  POST /v1/chat/completions · Bearer · model solar-pro3
//  reasoning_effort: minimal (축 대화는 추론 불필요 — 02.5 §4)
//  stream: true → SSE. delta는 choices[0].delta.content
//
// ⚠ 스트리밍이어야 한다. 전체 응답을 기다렸다 뱉으면 첫 토큰 2초(NFR-702)를 못 지킨다.
//
// 프롬프트 문구는 여기 없다 — `lib/ai/prompts/system-prompt.ts`가 유일한 출처다.
// 이 파일은 *어떻게 부르나*만 갖는다. 섞어 두면 프롬프트가 바뀌었는지가 어댑터 diff에 묻힌다.
import { buildSystemPrompt } from "../../prompts/system-prompt";
import { parseSseBuffer } from "../../../sse";
import type { RespondInput, ResponderPort } from "../port";

export const UPSTAGE_BASE = "https://api.upstage.ai/v1";

export interface SolarResponderOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  model?: string;
}

/** 첫 응답(헤더)까지 기다리는 한계. 스트림이 시작된 뒤에는 적용하지 않는다 —
 *  긴 답변을 중간에 끊으면 사용자가 문장을 잃는다. */
const CONNECT_TIMEOUT_MS = 20_000;

export class SolarResponder implements ResponderPort {
  private fetchImpl: typeof fetch;
  private base: string;
  private model: string;

  constructor(private opts: SolarResponderOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = opts.baseUrl ?? UPSTAGE_BASE;
    this.model = opts.model ?? "solar-pro3";
  }

  async *respond(input: RespondInput): AsyncIterable<string> {
    // 타임아웃이 없으면 상류가 응답을 시작하지 않을 때 **에러 없이 매달린다** —
    // 사용자에게는 "커서만 깜빡이는 화면"으로 보이고 로그에는 아무것도 남지 않는다.
    // 스트림이 시작된 뒤에는 해제한다. 긴 답변을 중간에 끊으면 안 되기 때문이다.
    const ctl = new AbortController();
    const connectTimer = setTimeout(() => ctl.abort(), CONNECT_TIMEOUT_MS);

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/chat/completions`, {
      signal: ctl.signal,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        reasoning_effort: "minimal",
        stream: true,
        messages: [
          // RespondInput이 PromptInput을 그대로 포함한다 — 어댑터가 값을 고르지 않는다.
          // 고르기 시작하면 mock과 real이 다른 것을 넘기고, 그게 곧 다른 서비스가 된다
          { role: "system", content: buildSystemPrompt(input) },
          ...input.utterances.map((u) => ({ role: "user" as const, content: u.text })),
        ],
      }),
      });
    } finally {
      clearTimeout(connectTimer);
    }

    if (!res.ok || !res.body) {
      // 조용히 mock으로 떨어지지 않는다 (보안 7조) — 라우트가 사용자 문구로 번역한다
      throw new Error(
        `[responder:solar] 호출 실패: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`,
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseBuffer(buffer);
      buffer = rest;
      for (const e of events) {
        if (e.data === "[DONE]") return;
        try {
          const chunk = JSON.parse(e.data) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // 부분 JSON·주석 라인은 무시한다
        }
      }
    }
  }
}
