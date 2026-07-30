// M-HANDWRITING — GET /api/will/draft/[id]/print (FR-302)
//
// ⚠ 이 경로에는 서명 관련 응답 필드가 존재하지 않는다. 유언장은 전자서명으로
//    효력이 생기지 않으므로(민법 §1066), 서명 URL을 만들 수 있는 자리를 아예 두지 않는다.
//    계약(HandwritingGuideRes)에도 서명 필드가 없다 — 타입이 그것을 강제한다.
import { HandwritingGuideRes } from "@/lib/contracts";
import { getSession } from "@/lib/ai/session/store";
import { buildHandwritingGuide } from "@/lib/rules/handwriting-guide";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await getSession(id);
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

  // 확정된 사실만으로 초안을 만든다 — 미확정 값으로 유언 문안을 쓰지 않는다 (P1)
  const confirmed = session.facts.filter((f) => f.confirmed);
  if (confirmed.length === 0) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "FACTS_UNCONFIRMED",
          message: "아직 확인되지 않은 내용으로는 초안을 만들 수 없습니다.",
          nextAction: "확인 화면에서 내용을 먼저 확인해 주세요.",
        },
      },
      { status: 403 },
    );
  }

  return Response.json({
    ok: true,
    data: HandwritingGuideRes.parse(
      buildHandwritingGuide({
        facts: confirmed.map((f) => ({ key: f.key, value: f.value })),
      }),
    ),
  });
}
