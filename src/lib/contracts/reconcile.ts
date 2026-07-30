// M-RECONCILER — 웹훅 유실 보정 폴링 (FR-504 · 02.3 §4)
// 관리자 화면에 "마지막 동기화 · 교정 건수" 노출 — 견고성 시연 지점.
import { z } from "zod";

export const ReconcileRes = z.object({
  corrected: z.number().int().nonnegative(),
  lastSyncAt: z.string().datetime(),
});
export type ReconcileRes = z.infer<typeof ReconcileRes>;
