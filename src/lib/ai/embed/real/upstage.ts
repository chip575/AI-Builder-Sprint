// real 임베딩 — Upstage Embeddings (02.5 §3)
//
// 근거: POST https://api.upstage.ai/v1/embeddings
//   model=embedding-passage → 4096차원 (2026-07-31 실측)
//   적재는 passage, 검색은 query 모델을 쓴다 — 섞으면 유사도가 떨어진다
import type { EmbeddingPort } from "../port";

export const UPSTAGE_BASE = "https://api.upstage.ai/v1";

/** 다른 어댑터와 같은 이유로 타임아웃을 건다 — 없으면 에러 없이 매달린다 (D-19) */
const TIMEOUT_MS = 60_000;

export interface UpstageEmbedderOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

export class UpstageEmbedder implements EmbeddingPort {
  private fetchImpl: typeof fetch;
  private base: string;

  constructor(private opts: UpstageEmbedderOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = opts.baseUrl ?? UPSTAGE_BASE;
  }

  private async call(model: string, input: string[]): Promise<number[][]> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/embeddings`, {
        method: "POST",
        signal: ctl.signal,
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, input }),
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      // 조용히 mock으로 떨어지지 않는다 (보안 7조)
      throw new Error(
        `[embed:upstage] 호출 실패: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as { data?: { embedding: number[] }[] };
    const out = (json.data ?? []).map((d) => d.embedding);
    if (out.length !== input.length) {
      throw new Error(`[embed:upstage] 입력 ${input.length}건에 응답 ${out.length}건`);
    }
    return out;
  }

  async embedPassages(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.call("embedding-passage", texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    const [v] = await this.call("embedding-query", [text]);
    return v!;
  }
}
