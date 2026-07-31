// M-BRANCH-DETECT — POST /api/branch/[id]/decide (FR-115A · FR-115B)
//
// **가지를 여는 것은 사용자다.** AI는 제안만 하고, 이 라우트가 그 제안에 대한
// 사용자의 결정을 받아 기록한다. 판정 자체는 순수 함수(lib/ai/branch/decide)가 하고
// 여기서는 저장과 방어만 한다.
//
// 무거운 가지는 승낙만으로 열리지 않는다 — 같은 세션 안에서 체결까지 가는 길을 막는다.
import { BranchDecision, BranchDecisionRes } from "@/lib/contracts";
import { isDeliberationAction, resolveDecision } from "@/lib/ai/branch/decide";
import { store } from "@/lib/store";

function bad(code: string, message: string, nextAction: string, status: number) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const parsed = BranchDecision.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return bad("INVALID_REQUEST", "선택을 확인하지 못했습니다.", "다시 눌러 주세요.", 400);
  }

  const proposal = await store.getProposal(id);
  if (!proposal) {
    return bad("NOT_FOUND", "해당 제안을 찾을 수 없습니다.", "대화 화면에서 다시 시도해 주세요.", 404);
  }

  // 이미 닫은 제안은 다시 열지 않는다. 닫힘이 번복되면 "닫았다"는 말이 무의미해진다
  if (proposal.status === "DECLINED") {
    return bad(
      "ALREADY_CLOSED",
      "이미 닫으신 제안입니다.",
      "원하시면 대화에서 다시 말씀해 주세요.",
      409,
    );
  }

  // 숙려 선택지는 숙려 화면을 거친 뒤에만 유효하다 — 제안 단계에서 바로 누를 수 없다.
  // 이 검사가 없으면 무거운 가지가 한 번의 클릭으로 열린다 (FR-115B가 막으려던 것)
  if (isDeliberationAction(parsed.data.action) && proposal.status !== "PENDING_RECONFIRM") {
    return bad(
      "DELIBERATION_REQUIRED",
      "먼저 안내를 확인해 주세요.",
      "고지 내용을 보신 뒤 다시 선택해 주세요.",
      409,
    );
  }

  const result = resolveDecision(proposal, parsed.data.action);

  // 결정은 **영속화한다.** 메모리에만 두면 인스턴스가 갈릴 때 거절이 되살아나고,
  // 사용자에게는 거절이 무시된 것으로 보인다 (FR-115A)
  await store.decideProposal(id, result.status);

  return Response.json({ ok: true, data: BranchDecisionRes.parse(result) });
}
