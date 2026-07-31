// M-TIMETRAVEL — POST /api/dev/advance-time (NFR-707)
//
// 데모에서 12개월을 30초로 압축한다. **가짜 시계를 만들지 않는다** —
// 미발화 약속의 기한을 당기고, 그다음은 실제 스케줄러가 실제 상태 머신으로 돈다.
// 시계를 가짜로 만들면 "데모에서만 도는 코드"가 생기고, 그건 시연이 아니라 연극이다.
//
// ⚠ 개발 전용. MODUSIGN_MODE=real이면 막는다 — 실 운영 데이터의 기한을 당기는 것은
//   사고다. dev 경로가 real에서 닫히는 규칙을 기존 dev 라우트와 동일하게 따른다.
import { AdvanceTimeReq, FiredObligations } from "@/lib/contracts";
import { store } from "@/lib/store";
import { POST as fireObligations } from "@/app/api/(m1)/obligations/fire/route";

export async function POST(req: Request) {
  if ((process.env.MODUSIGN_MODE ?? "mock") === "real") {
    return Response.json(
      {
        ok: false,
        error: {
          code: "DEV_ONLY",
          message: "시간 압축은 개발 모드에서만 사용할 수 있습니다.",
          nextAction: "MODUSIGN_MODE=mock으로 전환한 뒤 다시 시도하세요.",
        },
      },
      { status: 403 },
    );
  }

  const parsed = AdvanceTimeReq.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "6개월 또는 12개월만 선택할 수 있습니다.",
          nextAction: "다시 선택해 주세요.",
        },
      },
      { status: 400 },
    );
  }

  const months = parsed.data.months;
  await store.shiftObligationDueDates(months);

  // 당긴 뒤 **실제 발화 경로**를 그대로 태운다. 여기서 따로 발화 로직을 쓰면
  // 데모와 운영이 다른 코드를 타게 되고, 시연이 증거이길 그만둔다
  const res = await fireObligations(new Request("http://localhost/api/obligations/fire", { method: "POST" }));
  const body = await res.json();

  return Response.json({
    ok: true,
    data: FiredObligations.parse({
      advancedMonths: months,
      firedObligations: body.data.obligations,
    }),
  });
}
