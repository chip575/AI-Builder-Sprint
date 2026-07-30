// 어댑터 선택 — UPSTAGE_MODE=mock이면 키 없이 돈다 (NFR-707)
import { MockScanner } from "./mock-scanner";
import type { DocumentScannerPort } from "./port";
import { UpstageScanner } from "./real/upstage";

const mode = process.env.UPSTAGE_MODE ?? "mock";

function realScanner(): DocumentScannerPort {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) {
    // 키 없이 real을 켜면 조용히 mock으로 떨어지지 않고 명시적으로 실패한다 (보안 7조)
    return {
      scan: () =>
        Promise.reject(new Error("UPSTAGE_MODE=real인데 UPSTAGE_API_KEY가 없습니다.")),
    };
  }
  return new UpstageScanner({ apiKey });
}

export const scanner: DocumentScannerPort =
  mode === "real" ? realScanner() : new MockScanner();

export type { DocumentScannerPort, ScanInput, ScanResult } from "./port";
