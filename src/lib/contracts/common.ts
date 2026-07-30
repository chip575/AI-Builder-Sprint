// 공통 용어 enum — spec/00.2-glossary.md §7 (이 표기 외 사용 금지, Track은 폐기)
import { z } from "zod";

/** intents.kind — 중심 축 세션 or 가지 (D-01) */
export const IntentKind = z.enum(["SPINE_SESSION", "BRANCH"]);
export type IntentKind = z.infer<typeof IntentKind>;

/** 가지 유형 — 유산기부(LEGACY_GIFT)와 문화유산 후원(HERITAGE_SUPPORT)은 다르다 (00.2 §7.2) */
export const BranchType = z.enum([
  "DONATION_NOW",
  "HERITAGE_SUPPORT",
  "LEGACY_GIFT",
  "HANDWRITTEN_WILL",
  "ESTATE",
]);
export type BranchType = z.infer<typeof BranchType>;

/** 가지 제안 출처 — 직접 진입(EXPRESS) vs AI 감지(DETECTED) (FR-115) */
export const BranchOrigin = z.enum(["DETECTED", "EXPRESS"]);
export type BranchOrigin = z.infer<typeof BranchOrigin>;

/** 가지 무게 등급 — 무거운 가지는 같은 세션 내 체결 금지 (FR-115 §A) */
export const BranchWeight = z.enum(["LIGHT", "MEDIUM", "HEAVY"]);
export type BranchWeight = z.infer<typeof BranchWeight>;

/** 문서 유형 — 게이트 판정표의 행 (spec/00.1-rules.md §4) */
export const DocType = z.enum([
  "DONATION_PLEDGE",          // 기부 약정서
  "RECURRING_CONSENT",        // 정기후원 동의
  "PRIVACY_TAX_CONSENT",      // 개인정보·세액공제 동의
  "VOLUNTEER_PLEDGE",         // 자원봉사 약정 (FR-206 최소 유지)
  "HERITAGE_SUPPORT_PLEDGE",  // 문화유산 후원 약정 (FR-205)
  "LEGACY_GIFT_AGREEMENT",    // 유산기부 약정(사인증여, 민법 §562)
  "CUSTODIAN_AGREEMENT",      // Custodian 협조 약정 (유언집행자 아님 고지 필수)
  "INTENT_AFFIRMATION",       // 의사 확인서 (FR-551 — 문서명에 "유언" 금지)
  "HANDWRITTEN_WILL",         // 유언장 — ESIGN_INVALID, 서명 버튼 금지 (민법 §1066)
  "HEART_LETTER",             // 마음의 편지 — NON_BINDING
]);
export type DocType = z.infer<typeof DocType>;

/** 문서 상태 머신 — 역행 전이는 웹훅 처리에서 무시 (02.3 §3) */
export const DocStatus = z.enum([
  "DRAFT",
  "REQUESTED",
  "COMPLETED",
  "REJECTED",
  "CANCELED",
]);
export type DocStatus = z.infer<typeof DocStatus>;

/** 서명 참여자 — sign 상태·증빙 공용 */
export const Party = z.object({
  name: z.string(),
  role: z.enum(["REQUESTER", "SIGNER", "FAMILY_ACK"]),
  signedAt: z.string().datetime().nullish(),
});
export type Party = z.infer<typeof Party>;
