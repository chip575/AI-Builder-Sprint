// M-REWARDS — GET /api/rewards?orgId= (FR-203)
// 목록만 준다. 한도 수치는 내려보내지 않는다 — 한도가 필요하면 빈 선택으로
// POST /api/rewards/select를 부르면 remaining이 곧 한도다 (수치는 lib/rules 소관, P3).
import { z } from "zod";
import { Reward } from "@/lib/contracts";
import { REWARD_SEEDS } from "./seed";

export async function GET(req: Request) {
  const orgId = new URL(req.url).searchParams.get("orgId");
  const rewards = orgId
    ? REWARD_SEEDS.filter((r) => r.orgId === orgId)
    : REWARD_SEEDS;

  return Response.json({
    ok: true,
    data: z.array(Reward).parse(rewards),
  });
}
