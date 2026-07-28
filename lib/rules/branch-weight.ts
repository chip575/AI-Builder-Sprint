// 가지 무게 등급 (FR-115A 표) — 판정은 프롬프트가 아니라 이 코드가 한다.
// ⚠ human_review: required — M-BRANCH-DETECT 소속이지만 Express 판정(M-SESSION-MSG)도
//   같은 표를 쓰므로 여기 한 곳에만 둔다. 에이전트 단독 변경 금지 (보안 5조).
import type { BranchType, BranchWeight } from "../contracts/common";

/** LIGHT = 즉시 진행 · MEDIUM = 즉시 진행(Custodian 지정만 별도 확인) · HEAVY = 재확인/숙려 */
export const BRANCH_WEIGHT: Record<BranchType, BranchWeight> = {
  DONATION_NOW: "LIGHT",
  HERITAGE_SUPPORT: "LIGHT",
  ESTATE: "MEDIUM",
  LEGACY_GIFT: "HEAVY",
  HANDWRITTEN_WILL: "HEAVY",
};

/** HEAVY + DETECTED = 다음 세션 재확인 / HEAVY + EXPRESS = 숙려 화면 1회 (FR-115B) */
export function isHeavy(branchType: BranchType): boolean {
  return BRANCH_WEIGHT[branchType] === "HEAVY";
}
