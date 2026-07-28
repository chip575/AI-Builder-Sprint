// M-FACTS-CONFIRM — PATCH /api/facts/[id] (FR-103)
// 값 수정만 한다. 확정은 POST /api/facts/confirm으로만 — P1을 API 층에서 강제.
// 재추출은 하지 않는다 (수락 기준: "재추출 없이 즉시 반영").
import { FactPatch, FactPatchRes, type Recalc } from "@/lib/contracts";
import { findFact } from "@/lib/ai/session/store";
import { computeTaxDeduction } from "@/lib/rules/hometown-donation";

/** recalc가 도는 조건 — 이 둘뿐. 그 외 필드는 recalc: undefined */
const RECALC_KEYS = new Set(["amount", "isDisasterZone"]);

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = FactPatch.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "요청 형식이 올바르지 않습니다.",
          nextAction: "수정할 값을 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }

  const found = findFact(id);
  if (!found) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "해당 항목을 찾을 수 없습니다.",
          nextAction: "확인 화면을 새로고침해 주세요.",
        },
      },
      { status: 404 },
    );
  }

  const { session, fact } = found;

  let recalc: Recalc | undefined;
  if (RECALC_KEYS.has(fact.key)) {
    if (fact.key === "amount" && typeof parsed.data.value !== "number") {
      return Response.json(
        {
          ok: false,
          error: {
            code: "INVALID_AMOUNT",
            message: "금액은 숫자여야 합니다.",
            nextAction: "금액을 숫자로 입력해 주세요.",
          },
        },
        { status: 400 },
      );
    }
    // 계산은 반드시 lib/rules — 라우트 인라인 산식 금지 (P3, gate:check 3번)
    const disaster =
      session.facts.find((f) => f.key === "isDisasterZone")?.value === true;
    const oldAmount =
      fact.key === "amount" ? (fact.value as number) : amountOf(session);
    const newAmount =
      fact.key === "amount" ? (parsed.data.value as number) : amountOf(session);
    const newDisaster =
      fact.key === "isDisasterZone" ? parsed.data.value === true : disaster;
    if (oldAmount !== null && newAmount !== null) {
      const before = computeTaxDeduction(oldAmount, disaster);
      const after = computeTaxDeduction(newAmount, newDisaster);
      recalc = {
        field: "expectedDeduction",
        oldValue: before.deductionAmount,
        newValue: after.deductionAmount,
        formula: after.breakdown
          .map((b) => `${b.label} ${b.deducted.toLocaleString("ko-KR")}원`)
          .join(" + ")
          .concat(` = ${after.deductionAmount.toLocaleString("ko-KR")}원`),
      };
    }
  }

  fact.value = parsed.data.value;
  fact.confidence = 1; // 사용자가 직접 준 값 — 더 되물을 것 없음. 확정과는 별개다
  // 값이 바뀌면 확정은 무효다 — 확정 후 몰래 바꾸고 문서를 만드는 경로 차단 (P1).
  // 다시 확정하려면 confirm 라우트를 다시 눌러야 한다.
  fact.confirmed = false;

  return Response.json({
    ok: true,
    data: FactPatchRes.parse({ fact, recalc }),
  });
}

function amountOf(session: { facts: { key: string; value: unknown }[] }) {
  const v = session.facts.find((f) => f.key === "amount")?.value;
  return typeof v === "number" ? v : null;
}
