// M-PAPER-SCAN — 종이 약정 옮기기 (FR-401 · 02.5 DP+IE 파이프라인 · D-06 보완책)
// upload는 multipart라 본문 스키마가 없다. 업로드 화면에는 외부(Upstage) 전송 고지 필수 (D-10).
import { z } from "zod";
import { IntentFact } from "./extract";

export const PaperScanExtractReq = z.object({
  uploadId: z.string().uuid(), // POST /api/paper-scan/upload 이 반환한 ID
});
export type PaperScanExtractReq = z.infer<typeof PaperScanExtractReq>;

export const PaperScanUploadRes = z.object({
  uploadId: z.string().uuid(),
});
export type PaperScanUploadRes = z.infer<typeof PaperScanUploadRes>;

export const PaperScanRes = z.object({
  parsedText: z.string(),               // Document Parse markdown 출력
  extractedFacts: z.array(IntentFact),  // IE 결과 — confirmed=false로 시작 (P1)
});
export type PaperScanRes = z.infer<typeof PaperScanRes>;
