// M-ADMIN — 기관 대시보드 (FR-601 · FR-602). RLS로 기관 격리 — 다른 단체 조회는 거부.
import { z } from "zod";
import { DocStatus } from "./common";

export const AdminSummaryRes = z.object({
  /** 상태별 건수 — DocStatus 키만 허용 */
  byStatus: z.record(DocStatus, z.number().int().nonnegative()),
  /** 정기후원 갱신 도래 목록 (FR-604) */
  renewalDue: z.array(
    z.object({
      docId: z.string().uuid(),
      donorName: z.string(), // 마스킹된 표시명 — 원문 개인정보 금지 (NFR-714)
      dueAt: z.string().datetime(),
    }),
  ),
  /** 게이트 차단 카운터 (FR-509 — AI 품질 기여 시연) */
  gateBlockedCount: z.number().int().nonnegative(),
  /** 리컨실러 상태 (FR-504) */
  lastSyncAt: z.string().datetime().nullish(),
  reconcileCorrected: z.number().int().nonnegative(),
});
export type AdminSummaryRes = z.infer<typeof AdminSummaryRes>;
