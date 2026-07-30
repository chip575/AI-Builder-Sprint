// M-HEARTWILL — 마음 유언, 살아있는 유서 (FR-111 · FR-112)
// NON_BINDING — "법적 효력이 없는 문서입니다" 고지 영구 포함.
// AI는 문단 초안만 만든다. 반영 여부는 사용자가 문단 단위로 승인한다 (P1).
import { z } from "zod";

export const HeartWillApplyReq = z.object({
  sessionId: z.string().uuid(),
  /** 사용자가 승인한 문단만 반영된다 — 빈 배열이면 문서는 갱신되지 않는다 */
  acceptedParagraphIds: z.array(z.string().uuid()),
});
export type HeartWillApplyReq = z.infer<typeof HeartWillApplyReq>;

export const HeartWillVersionRes = z.object({
  versionId: z.string().uuid(),
  /** 이전 버전 대비 변경 요약 — diff 확인 후 클릭이 P1의 승인 형식 */
  diff: z.array(
    z.object({
      paragraphId: z.string().uuid(),
      kind: z.enum(["ADDED", "EDITED", "REMOVED"]),
      /** 근거 발화 — 문서의 모든 문단은 원문을 참조한다 (FR-111) */
      sourceUtteranceId: z.string().uuid().nullish(),
    }),
  ),
});
export type HeartWillVersionRes = z.infer<typeof HeartWillVersionRes>;

/** PATCH /api/heartwill/delivery — 전달 설정 (FR-112) */
export const DeliveryPatch = z.object({
  revealPolicy: z.enum(["IMMEDIATE", "SCHEDULED", "POSTHUMOUS"]),
  revealAt: z.string().datetime().nullish(), // SCHEDULED일 때만
  recipientIds: z.array(z.string().uuid()),
});
export type DeliveryPatch = z.infer<typeof DeliveryPatch>;

export const DeliveryPatchRes = z.object({
  updated: z.boolean(),
});
export type DeliveryPatchRes = z.infer<typeof DeliveryPatchRes>;
