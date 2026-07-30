// 어댑터 선택 — UPSTAGE_MODE=mock이면 키 없이 돈다 (NFR-707).
// real(Solar structured output)은 키 확보 후 구현. 조용한 mock 폴백 금지 (보안 7조).
import { MockExtractor } from "./mock-extractor";
import { SolarExtractor } from "./real/solar";
import type { ExtractorPort } from "./port";

const mode = process.env.UPSTAGE_MODE ?? "mock";

function realExtractor(): ExtractorPort {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) {
    // 키 없이 real을 켜면 조용히 mock으로 떨어지지 않고 명시적으로 실패한다 (보안 7조)
    return {
      extract: () =>
        Promise.reject(new Error("UPSTAGE_MODE=real인데 UPSTAGE_API_KEY가 없습니다.")),
    };
  }
  return new SolarExtractor({ apiKey });
}

export const extractor: ExtractorPort =
  mode === "real" ? realExtractor() : new MockExtractor();
