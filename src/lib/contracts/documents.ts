// M-DOCUMENTS — 문서 초안 생성 (FR-501 전 단계)
// 서버는 unconfirmed 사실 또는 게이트 불통과 시 403으로 거부한다 (FR-103·FR-104).
import { z } from "zod";

export const DocumentCreateReq = z.object({
  intentId: z.string().uuid(),
});
export type DocumentCreateReq = z.infer<typeof DocumentCreateReq>;

export const DraftRes = z.object({
  draftId: z.string().uuid(),
  pdfUrl: z.string().url(), // 미리보기용 — 만료형 서명 URL 규칙은 01.7
});
export type DraftRes = z.infer<typeof DraftRes>;
