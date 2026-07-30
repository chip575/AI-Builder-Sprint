// M-REWARDS — POST /api/rewards/select (FR-203)
// overLimit 판정은 서버가 최종이다 — 화면의 선택 불가는 UX일 뿐, 강제는 여기.
// 클라이언트가 rewardIds를 조작해 보내도 lib/rules 재검증으로 거부한다(422).
// 선택 0건도 유효한 완료 상태다 — 기부는 답례품이 목적이 아니다. 이때 remaining이 곧 한도라
// 화면의 "한도 조회" 용도로도 쓰인다.
import { RewardSelect, RewardSelectRes } from "@/lib/contracts";
import { checkRewardLimit } from "@/lib/rules/hometown-donation";
import { REWARD_SEEDS } from "../seed";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RewardSelect.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "요청 형식이 올바르지 않습니다.",
          nextAction: "선택한 답례품과 기부 금액을 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }

  const selected = parsed.data.rewardIds.map((id) =>
    REWARD_SEEDS.find((r) => r.id === id),
  );
  if (selected.some((r) => !r)) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "UNKNOWN_REWARD",
          message: "목록에 없는 답례품이 포함되어 있습니다.",
          nextAction: "답례품을 다시 선택해 주세요.",
        },
      },
      { status: 400 },
    );
  }
  const rewards = selected as NonNullable<(typeof selected)[number]>[];

  // 한도 계산은 lib/rules — 수치는 라우트에 없다 (P3)
  const total = rewards.reduce((sum, r) => sum + r.price, 0);
  const { remaining, overLimit } = checkRewardLimit(parsed.data.amount, total);

  if (overLimit) {
    // 경고가 아니라 거부다 — 법정 제약 (FR-203)
    return Response.json(
      {
        ok: false,
        error: {
          code: "REWARD_LIMIT_EXCEEDED",
          message: "답례품 합계가 선택 가능 한도를 넘었습니다.",
          nextAction: "답례품을 줄이거나 다른 구성으로 선택해 주세요.",
        },
      },
      { status: 422 },
    );
  }

  return Response.json({
    ok: true,
    data: RewardSelectRes.parse({ selected: rewards, remaining, overLimit }),
  });
}
