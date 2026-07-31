// 감지 어댑터 선택 — UPSTAGE_MODE=mock이면 키 없이 돈다 (NFR-707).
// 조용한 mock 폴백 금지 (보안 7조) — real인데 키가 없으면 호출 시점에 명시적으로 실패한다.
import { MockDetector } from "./mock-detector";
import { SolarDetector } from "./real/solar-detector";
import type { DetectorPort } from "./port";

const mode = process.env.UPSTAGE_MODE ?? "mock";

function realDetector(): DetectorPort {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) {
    return {
      detect: () =>
        Promise.reject(new Error("UPSTAGE_MODE=real인데 UPSTAGE_API_KEY가 없습니다.")),
    };
  }
  return new SolarDetector({ apiKey });
}

export const detector: DetectorPort =
  mode === "real" ? realDetector() : new MockDetector();

export type { BranchSignal, DetectInput, DetectorPort } from "./port";
