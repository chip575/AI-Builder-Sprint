// M-FAMILY-ACK — 가족 인지 확인 서명 (FR-554)
// 동의가 아니라 인지다. 거부해도 본인 확인서 효력은 유지되고 거부 사실만 기록된다.
// 통지 대상 지정은 본인의 자유 — 통지하지 않을 자유도 보장 (P4).
import { z } from "zod";

export const FamilyAckReq = z.object({
  ledgerNodeId: z.string().uuid(),
  /** 본인이 지정한 통지 대상 — 빈 배열 허용 (통지 안 함) */
  recipientIds: z.array(z.string().uuid()),
});
export type FamilyAckReq = z.infer<typeof FamilyAckReq>;

export const FamilyAckRes = z.object({
  requested: z.number().int().nonnegative(),
  acks: z.array(
    z.object({
      recipientId: z.string().uuid(),
      status: z.enum(["PENDING", "ACKNOWLEDGED", "DECLINED"]),
      respondedAt: z.string().datetime().nullish(),
    }),
  ),
});
export type FamilyAckRes = z.infer<typeof FamilyAckRes>;
