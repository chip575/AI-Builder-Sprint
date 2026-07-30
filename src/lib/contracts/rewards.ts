// M-REWARDS — 답례품 선택 (FR-203). 한도 초과는 경고가 아니라 선택 불가.
// 금지 품목(현금·귀금속·유가증권)은 데이터에 존재하지 않는다 — 스키마에 등장할 이유도 없다.
import { z } from "zod";

export const Reward = z.object({
  id: z.string().uuid(),
  name: z.string(),
  price: z.number().positive(),
  orgId: z.string().uuid(),
});
export type Reward = z.infer<typeof Reward>;

export const RewardSelect = z.object({
  rewardIds: z.array(z.string().uuid()),
  amount: z.number().positive(), // 기부 금액 — 한도 계산은 lib/rules가 한다
});
export type RewardSelect = z.infer<typeof RewardSelect>;

export const RewardSelectRes = z.object({
  selected: z.array(Reward),
  /** 남은 선택 가능 금액 (한도 − 선택 합계) */
  remaining: z.number(),
  overLimit: z.boolean(),
});
export type RewardSelectRes = z.infer<typeof RewardSelectRes>;
