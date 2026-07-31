// 어댑터 선택 — UPSTAGE_MODE=mock이면 키 없이 회상 검색이 돈다 (NFR-707).
// real인데 키가 없으면 **명시적으로 실패**한다. 조용히 mock으로 떨어지면
// "임베딩이 됐다"는 착각을 만든다 (보안 7조).
import { MockEmbedder } from "./mock-embedder";
import { UpstageEmbedder } from "./real/upstage";
import type { EmbeddingPort } from "./port";

const mode = process.env.UPSTAGE_MODE ?? "mock";

function build(): EmbeddingPort {
  if (mode !== "real") return new MockEmbedder();
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) {
    const fail = () =>
      Promise.reject(new Error("UPSTAGE_MODE=real인데 UPSTAGE_API_KEY가 없습니다."));
    return { embedPassages: fail, embedQuery: fail };
  }
  return new UpstageEmbedder({ apiKey });
}

export const embedder: EmbeddingPort = build();
export const isMockEmbedder = mode !== "real";
