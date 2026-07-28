// 어댑터 선택 — UPSTAGE_MODE=mock이면 키 없이 돈다 (NFR-707).
// real(Solar structured output)은 키 확보 후 구현. 조용한 mock 폴백 금지 (보안 7조).
import { MockExtractor } from "./mock-extractor";
import type { ExtractorPort } from "./port";

const mode = process.env.UPSTAGE_MODE ?? "mock";

function unimplementedReal(): ExtractorPort {
  return {
    extract: () =>
      Promise.reject(
        new Error("UPSTAGE_MODE=real은 아직 구현 전입니다. mock으로 전환하세요."),
      ),
  };
}

export const extractor: ExtractorPort =
  mode === "real" ? unimplementedReal() : new MockExtractor();
