// M-REWARDS — 답례품 시드 (FR-203)
// 전량 가상 상품 (보안 4조) — 실명 상품·업체는 확인 안 된 가격 정보가 붙어 리스크만 생긴다.
// 금지 품목(현금·귀금속·유가증권)은 여기 존재하지 않는다 — 없는 것은 실수로도 노출될 수 없다.
import type { Reward } from "@/lib/contracts";

/** 가상 기부처(부산 가상 단체) — org 모델링은 M-ADMIN(M1)에서 확장 */
export const SEED_ORG_ID = "00000000-0000-4000-8000-00000000006f";

export const REWARD_SEEDS: Reward[] = [
  { id: "00000000-0000-4000-8000-0000000000a1", name: "부산 전통 과자 세트", price: 12_000, orgId: SEED_ORG_ID },
  { id: "00000000-0000-4000-8000-0000000000a2", name: "지역 특산 김 세트", price: 15_000, orgId: SEED_ORG_ID },
  { id: "00000000-0000-4000-8000-0000000000a3", name: "도자기 찻잔 2인조", price: 22_000, orgId: SEED_ORG_ID },
  { id: "00000000-0000-4000-8000-0000000000a4", name: "지역 캐릭터 인형", price: 9_000, orgId: SEED_ORG_ID },
  { id: "00000000-0000-4000-8000-0000000000a5", name: "전통차 선물세트", price: 18_000, orgId: SEED_ORG_ID },
  { id: "00000000-0000-4000-8000-0000000000a6", name: "수제 비누 세트", price: 8_000, orgId: SEED_ORG_ID },
];
