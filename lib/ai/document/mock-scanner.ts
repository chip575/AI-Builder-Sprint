// mock 종이 판독기 (UPSTAGE_MODE=mock · NFR-707)
// 픽스처는 **전량 가상**이다 — 실존 약정서·실계좌·실인물 금지 (보안 4조).
import type { DocumentScannerPort, ScanInput, ScanResult } from "./port";

/** 가상 종이 기부약정서 — 데모용. 실물 샘플은 docs/fixtures/sample-paper-pledge.pdf */
export const FIXTURE_PARSED_TEXT = `# 기부 약정서

| 항목 | 내용 |
| --- | --- |
| 기부자 | 김가상 |
| 기부처 | 부산광역시 |
| 기부 금액 | 금 삼십만원정 (300,000원) |
| 약정일 | 2024년 5월 12일 |

위와 같이 기부할 것을 약정합니다.

(서명) 김가상 (인)`;

export class MockScanner implements DocumentScannerPort {
  async scan(input: ScanInput): Promise<ScanResult> {
    void input; // mock은 내용과 무관하게 같은 결과를 낸다 (결정론)
    return {
      parsedText: FIXTURE_PARSED_TEXT,
      fields: [
        { key: "region", value: "부산", sourceText: "부산광역시" },
        { key: "amount", value: 300_000, sourceText: "300,000원" },
      ],
    };
  }
}
