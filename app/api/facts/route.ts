// M-FACTS-CONFIRM — GET /api/facts?intentId= (FR-103)
// 확인 화면(S3) 마운트용 조회. POST /api/extract 재호출로 대신하지 않는다 —
// 그건 UPSERT라 사용자가 편집한 미확정 값을 추출값으로 덮는다.
import { FactSheetReq, FactSheetRes } from "@/lib/contracts";
import { getSession } from "@/lib/ai/session/store";
import { requiredSlotsFor } from "@/lib/ai/extract/mock-extractor";
import { computeTaxDeduction } from "@/lib/rules/hometown-donation";

export async function GET(req: Request) {
  const parsed = FactSheetReq.safeParse({
    intentId: new URL(req.url).searchParams.get("intentId") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "요청 형식이 올바르지 않습니다.",
          nextAction: "확인 화면을 다시 열어 주세요.",
        },
      },
      { status: 400 },
    );
  }

  const session = await getSession(parsed.data.intentId);
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

  // 필수 슬롯은 확정 시점과 같은 규칙으로 재계산한다 (FR-102) — 스냅숏에 의존하지 않는다
  const required = requiredSlotsFor(session.proposals.at(-1)?.branchType ?? null);
  const missingRequired = required.filter((key) => {
    const fact = session.facts.find((f) => f.key === key);
    return !fact || fact.value === null || fact.value === "";
  });

  // 계산은 lib/rules — 라우트에 수치를 두지 않는다 (P3)
  const amount = session.facts.find((f) => f.key === "amount")?.value;
  const disaster = session.facts.find((f) => f.key === "isDisasterZone")?.value === true;
  const deduction =
    typeof amount === "number" && amount > 0
      ? computeTaxDeduction(amount, disaster)
      : null;

  return Response.json({
    ok: true,
    data: FactSheetRes.parse({
      intentId: session.id,
      facts: session.facts,
      missingRequired,
      confirmedAt: session.confirmedAt,
      deduction,
    }),
  });
}
