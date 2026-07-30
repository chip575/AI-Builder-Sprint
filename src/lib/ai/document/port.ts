// DocumentScannerPort — 종이 문서 판독 경계 (FR-401 · 02.5)
// Document Parse(판독) + Information Extract(구조화)를 한 포트로 묶는다.
// ExtractorPort·SignerPort와 동형: mock은 픽스처, real은 fetch 주입 + 문서 근거 주석.

export interface ScanInput {
  /** 원본 바이트. 화면에도 로그에도 경로를 노출하지 않는다 (보안 3조) */
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}

export interface ScanResult {
  /** Document Parse의 markdown 출력 — 사람이 검토할 수 있는 판독 결과 */
  parsedText: string;
  /** Information Extract가 뽑은 값. key는 우리 슬롯 이름으로 정규화된 상태 */
  fields: { key: string; value: string | number; sourceText?: string }[];
}

export interface DocumentScannerPort {
  scan(input: ScanInput): Promise<ScanResult>;
}
