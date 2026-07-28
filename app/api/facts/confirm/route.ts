// M-FACTS-CONFIRM — POST /api/facts/confirm (FR-103 "확인 버튼" 그 자체)
// 세션의 모든 fact를 일괄 확정한다. 이 라우트를 거치지 않으면 문서 생성은 403이다.
// 필수 슬롯이 비어 있으면 확정 자체를 거부한다 (FR-102 — 추측으로 채우지 않는다).
import { FactsConfirmReq, FactsConfirmRes } from "@/lib/contracts";
import { getSession } from "@/lib/ai/session/store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = FactsConfirmReq.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "요청 형식이 올바르지 않습니다.",
          nextAction: "intentId를 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }

  const session = getSession(parsed.data.intentId);
  if (!session) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "해당 대화를 찾을 수 없습니다.",
          nextAction: "대화를 먼저 시작해 주세요.",
        },
      },
      { status: 404 },
    );
  }

  if (session.missingRequired.length > 0) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "FACTS_INCOMPLETE",
          message: "아직 채워지지 않은 항목이 있습니다.",
          nextAction: `다음 항목을 먼저 알려주세요: ${session.missingRequired.join(", ")}`,
        },
      },
      { status: 422 },
    );
  }

  let confirmedCount = 0;
  for (const fact of session.facts) {
    if (!fact.confirmed) confirmedCount += 1;
    fact.confirmed = true; // 유일한 확정 지점 — P1의 해제 경로
  }

  return Response.json({
    ok: true,
    data: FactsConfirmRes.parse({
      intentId: session.id,
      confirmedCount,
      confirmedAt: new Date().toISOString(),
    }),
  });
}
