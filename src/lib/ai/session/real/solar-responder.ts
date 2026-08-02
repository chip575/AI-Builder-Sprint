// real 대화 응답 — Solar 스트리밍 (FR-101 · 02.5 §2)
//
// 근거: https://console.upstage.ai/api/docs/for-agents/raw (2026-07-30 확인)
//  POST /v1/chat/completions · Bearer · model solar-pro3
//  reasoning_effort: minimal (축 대화는 추론 불필요 — 02.5 §4)
//  stream: true → SSE. delta는 choices[0].delta.content
//
// ⚠ 스트리밍이어야 한다. 전체 응답을 기다렸다 뱉으면 첫 토큰 2초(NFR-702)를 못 지킨다.
// ⚠ 프롬프트에 법률 수치를 넣지 않는다 (P3). 계산은 lib/rules가 하고 AI는 안내만 한다.
import type { BranchType } from "../../../contracts/common";
import { parseSseBuffer } from "../../../sse";
import type { RespondInput, ResponderPort } from "../port";

export const UPSTAGE_BASE = "https://api.upstage.ai/v1";

/** 가지별 대화 목표 — 무엇을 물을지. 수치·한도는 등장하지 않는다 (P3) */
const BRANCH_GOAL: Record<BranchType, string> = {
  DONATION_NOW:
    "기부하실 지역과 금액을 차근차근 여쭙는다. 세액공제 예상액은 다음 확인 화면에서 계산해 보여드린다고만 말한다.",
  HERITAGE_SUPPORT: "후원하실 문화유산과 방식을 여쭙는다.",
  LEGACY_GIFT:
    // ⚠ "오늘 진행할지 고르시게 한다"를 여기 넣지 않는다 — 그 결정은 화면 버튼(decide API)만
    //   받을 수 있어서, 대화가 물으면 사용자가 채팅으로 답하고 상태는 안 바뀌는 도돌이표가
    //   된다 (2026-08-02 실사용). 숙려 대기 중에는 route가 LLM을 건너뛴다 (handoff.ts)
    "사후에 남기시려는 뜻을 여쭙되, 가족의 유류분에 영향이 있을 수 있다는 고지를 먼저 안내한다. 받으실 곳과 규모를 한 번에 하나씩 여쭙는다. 진행 여부는 화면이 받으므로 묻지 않는다.",
  HANDWRITTEN_WILL:
    "유언장은 법이 정한 자필 방식으로만 효력이 생긴다고 안내하고, 손으로 옮겨 적는 과정을 돕겠다고 말한다. 서명을 권하지 않는다.",
  ESTATE: "무엇이 어디에 있는지부터 하나씩 여쭙는다.",
};

const SYSTEM = [
  "너는 인생의 마지막 정리를 돕는 대화 상대다. 존댓말로, 짧고 따뜻하게 답한다.",
  "규칙:",
  "1. **질문은 정확히 하나만 한다.** 물음표는 답변 전체에서 한 번만 쓴다 — 여러 개를 물으면 사용자가 무엇에 답할지 몰라 대화가 끊긴다.",
  "2. 금액·수증자·기부처를 네가 먼저 제안하지 않는다. 사용자가 정한다.",
  "3. 숫자를 만들어 말하지 않는다. 세금·공제·한도 계산은 다른 곳에서 처리한다.",
  "4. 재촉하지 않는다. '지금', '빨리', '놓치기 전에' 같은 표현을 쓰지 않는다.",
  "5. 언제든 멈출 수 있다는 것을 사용자가 알게 한다.",
  "6. 3문장을 넘기지 않는다.",
  "7. **이미 알고 있는 항목은 다시 묻지 않는다.** 사용자가 말한 것을 되물으면 듣지 않은 것이 된다.",
  "8. 괄호로 행동·표정을 묘사하지 않는다. '(고개를 끄덕이며)' 같은 지시문을 쓰지 않는다.",
  "9. 질문 문장이 주어지면 **그 문장을 그대로** 쓴다. 바꿔 말하거나 다른 질문으로 대체하지 않는다.",
  "10. **다만 사용자가 방금 무언가를 요청하거나 되물었으면 그것에 먼저 답한다.** 이때는 주어진 질문을 하지 않는다 — 사용자가 '서류를 달라', '무슨 말이냐'고 했는데 준비된 질문을 반복하면 대화가 아니라 자동응답기가 된다.",
  "11. 사용자가 문서·서류·약정서를 요청하면, 어떤 것을 남기고 싶은지 한 가지만 되물어 확인한다. 문서를 네가 만들어 주겠다고 말하지 않는다 — 만드는 것은 사용자가 확인한 뒤의 일이다.",
].join("\n");

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
    // 코드가 아는 것을 모델에게 넘긴다. 안 넘기면 real 모델도 방금 들은 것을 되묻는다 —
    // eval 첫 측정이 41.7%였던 원인과 같은 계열이다 (필수 슬롯 미전달)
    const NL = String.fromCharCode(10);
    const known = input.knownFacts.map((f) => `- ${f.key}: ${f.value}`).join(NL);
    const missing = input.missingRequired.join(", ");

    const goal = input.branchType
      ? [
          BRANCH_GOAL[input.branchType],
          known ? `이미 확인된 항목(다시 묻지 않는다):${NL}${known}` : "",
          missing
            ? `아직 여쭐 항목: ${missing}. 이 중 하나만 묻는다.`
            : "필요한 항목이 다 모였다. 확인 화면으로 넘어가자고 안내한다.",
        ]
          .filter(Boolean)
          .join(NL + NL)
      : [
          "무엇을 남기고 싶으신지 회상으로 여쭙는다.",
          // 질문 문장은 룰테이블이 정한다 — 모델이 지어내면 매번 다른 질문이 나와
          // 사용자가 이야기를 이어갈 수 없다
          // 질문 문장을 그대로 쓰게 한다 — 모델이 바꿔 말하면 매번 다른 질문이 나오고,
          // 사용자는 지난번에 어디까지 이야기했는지 알 수 없게 된다 (FR-301)
          input.nextAxisQuestion
            ? `짧게 공감한 뒤 **아래 문장을 그대로** 여쭙는다. 다른 질문을 덧붙이지 않는다.${NL}"${input.nextAxisQuestion}"${NL}${NL}` +
              "단, 사용자가 방금 **요청하거나 되물었다면** 그 말에 먼저 답하고 이 질문은 하지 않는다. " +
              "준비된 질문을 사용자의 말보다 앞세우지 않는다."
            : "",
        ]
          .filter(Boolean)
          .join(NL + NL);

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
          { role: "system", content: `${SYSTEM}\n\n이번 대화의 목표: ${goal}` },
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
