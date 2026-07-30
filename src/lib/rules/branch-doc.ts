// 가지 → 대표 문서 유형 매핑 (00-constitution §3.2 표 · 00.2 §7.2)
// 법적 분류이므로 lib/rules에 둔다 — 판정은 프롬프트가 아니라 코드가 한다.
// ⚠ human_review: required — 에이전트 단독 변경 금지 (보안 5조).
import type { BranchType, DocType } from "../contracts/common";

export const BRANCH_PRIMARY_DOC: Record<BranchType, DocType> = {
  DONATION_NOW: "DONATION_PLEDGE",
  HERITAGE_SUPPORT: "HERITAGE_SUPPORT_PLEDGE",
  LEGACY_GIFT: "LEGACY_GIFT_AGREEMENT",     // 사인증여 + 유류분 고지 (민법 §562)
  HANDWRITTEN_WILL: "HANDWRITTEN_WILL",     // 게이트에서 ESIGN_INVALID → 필사 가이드
  ESTATE: "CUSTODIAN_AGREEMENT",            // M0 범위 밖 — Custodian 협조 약정이 대표
};
