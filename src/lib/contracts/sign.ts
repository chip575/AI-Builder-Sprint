// M-SIGN — 서명 요청·상태 폴링 (FR-501 · FR-502 · 02.3)
// HANDWRITTEN_WILL은 이 계약에 도달할 수 없다 — 게이트가 서버에서 차단한다 (P2).
import { z } from "zod";
import { DocStatus, Party } from "./common";

export const SignReq = z.object({
  mode: z.enum(["LINK", "EMBED"]),
});
export type SignReq = z.infer<typeof SignReq>;

export const SignRes = z.object({
  signUrl: z.string().url().nullish(),   // mode=LINK
  embedUrl: z.string().url().nullish(),  // mode=EMBED — 2시간 만료, 만료 시 재발급 버튼 (FR-502)
  expiresAt: z.string().datetime(),
});
export type SignRes = z.infer<typeof SignRes>;

/** GET /api/sign/[draftId]/status — 3초 폴링 (02.4 §0) */
export const SignStatusRes = z.object({
  status: DocStatus,
  parties: z.array(Party),
  completedAt: z.string().datetime().nullish(),
  /** REJECTED일 때 거절 사유 (FR-506) */
  rejectReason: z.string().nullish(),
});
export type SignStatusRes = z.infer<typeof SignStatusRes>;
