// M-BRANCH-DETECT — 가지 제안·결정 (FR-115A)
// AI는 가지를 열지 않는다 — 제안만 한다. 무게 등급 판정은 lib/rules/branch-weight.ts (코드).
// 닫은 가지는 다시 제안하지 않는다 (거부 이력 영구 보존).
import { z } from "zod";
import { BranchOrigin, BranchType, BranchWeight } from "./common";

export const BranchProposal = z.object({
  id: z.string().uuid(),
  branchType: BranchType,
  origin: BranchOrigin,
  weight: BranchWeight,
  /** 근거 발화 — 근거 없는 제안은 생성 자체가 금지된다 */
  sourceUtteranceId: z.string().uuid(),
  /** 확인형 제안 문구 — 권유·설득 금지 */
  message: z.string(),
});
export type BranchProposal = z.infer<typeof BranchProposal>;

export const BranchDecision = z.object({
  action: z.enum([
    "ACCEPT",        // 진행 (HEAVY + DETECTED이면 다음 세션 재확인이 먼저)
    "DECLINE",       // 닫기 — 재제안 금지
    "DEFER",         // "나중에 생각할래요" (P4)
    "PROCEED_TODAY", // 숙려 화면: 오늘 진행 (EXPRESS 진입의 무거운 가지)
    "PROCEED_LATER", // 숙려 화면: 다음에
  ]),
});
export type BranchDecision = z.infer<typeof BranchDecision>;

export const BranchDecisionRes = z.object({
  status: z.enum(["OPENED", "PENDING_RECONFIRM", "DECLINED", "DEFERRED"]),
  /** 다음 화면 라우팅 힌트 (예: 숙려 화면, 슬롯 대화) */
  nextStep: z.string().nullish(),
});
export type BranchDecisionRes = z.infer<typeof BranchDecisionRes>;
