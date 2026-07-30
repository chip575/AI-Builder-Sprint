// M-EVIDENCE — 증빙 보관 (FR-505)
import { z } from "zod";
import { Party } from "./common";

export const EvidenceRes = z.object({
  /** 15분 만료 서명 URL (D-10 — 원본 보존 + 만료형 접근) */
  pdfUrl: z.string().url(),
  signedAt: z.string().datetime(),
  parties: z.array(Party),
  /** 완료 PDF sha256 — 다운로드본 검증용 */
  hash: z.string(),
});
export type EvidenceRes = z.infer<typeof EvidenceRes>;
