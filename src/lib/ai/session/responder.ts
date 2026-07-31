// 어댑터 선택 — UPSTAGE_MODE=mock이면 키 없이 돈다 (NFR-707)
import { mockReply, tokenize } from "./mock-responder";
import type { RespondInput, ResponderPort } from "./port";
import { SolarResponder } from "./real/solar-responder";

const mode = process.env.UPSTAGE_MODE ?? "mock";

class MockResponder implements ResponderPort {
  async *respond(input: RespondInput): AsyncIterable<string> {
    for (const t of tokenize(mockReply(input))) yield t;
  }
}

function realResponder(): ResponderPort {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) {
    // 키 없이 real을 켜면 조용히 mock으로 떨어지지 않고 명시적으로 실패한다 (보안 7조)
    return {
      // eslint-disable-next-line require-yield
      async *respond() {
        throw new Error("UPSTAGE_MODE=real인데 UPSTAGE_API_KEY가 없습니다.");
      },
    };
  }
  return new SolarResponder({ apiKey });
}

export const responder: ResponderPort =
  mode === "real" ? realResponder() : new MockResponder();
