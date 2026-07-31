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

/** POST /api/sign/[draftId]/remind — 미서명 리마인드 (FR-507)
 *  누구에게 보낼지는 입력에 없다. 미서명자는 서버가 이미 안다 (parties[].signedAt).
 *  수신자를 입력으로 받으면 이미 서명한 사람에게 재발송하는 경로가 열린다.
 *  ⚠ draftId는 경로에도 있다. **경로가 정본**이고 바디가 다르면 400으로 거절한다 —
 *    두 출처가 조용히 갈리면 남의 문서에 리마인드를 보내는 경로가 된다 (구현 시 테스트로 고정).
 *  임계 시간은 코드가 갖는다. 계약에 숫자를 싣지 않는다 (P3). */
export const RemindReq = z.object({
  draftId: z.string().uuid(),
});
export type RemindReq = z.infer<typeof RemindReq>;

export const RemindRes = z.object({
  sentAt: z.string().datetime(),
  /** 이 문서 기준 누적 발송 횟수 — FR-507 "발송 이력이 기록된다"의 관측 가능한 형태 */
  remindCount: z.number().int().positive(),
});
export type RemindRes = z.infer<typeof RemindRes>;
