// M-LEDGER — POST /api/ledger (FR-551~553, FR-555)
// 뜻이 바뀐 사건 하나를 원장에 append한다. 수정·삭제 경로는 만들지 않는다 —
// 고칠 수 있는 이력은 이력이 아니다.
//
// 실질성 판정은 여기(코드)서 한다. 사용자가 등급을 고르게 하면 재서명을 피하려고
// 늘 MINOR를 고르게 되고, 그러면 등급이 아무것도 뜻하지 않게 된다 (FR-552).
import { LedgerNodeReq, LedgerRes } from "@/lib/contracts";
import { judgeMateriality, verifyChain } from "@/lib/ledger/chain";
import { store } from "@/lib/store";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { createDraft } from "@/app/api/(m0)/documents/store";
import { getCurrentUserId, loginRequired } from "@/lib/auth/session";

function bad(code: string, message: string, nextAction: string, status: number) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = LedgerNodeReq.safeParse(body);
  if (!parsed.success) {
    return bad(
      "INVALID_REQUEST",
      "요청 형식이 올바르지 않습니다.",
      "변경할 내용과 사유를 다시 입력해 주세요.",
      400,
    );
  }

  // 변경 사유는 정황 봉인의 핵심이다 (FR-553). 빈 문자열이면 노드는 남지만
  // "왜 바꿨는가"가 비어 있어 이력이 오히려 공격 재료가 된다
  if (parsed.data.changeReason.trim() === "") {
    return bad(
      "REASON_REQUIRED",
      "무엇 때문에 마음이 바뀌셨는지 한 줄만 남겨 주세요.",
      "변경 사유를 적어 주세요.",
      400,
    );
  }

  // 소유 확인 (2026-08-03) — subjectId만 알면 **남의 원장에 노드를 쌓을 수 있었다.**
  // 원장은 append-only라 잘못 들어간 노드는 지울 수도 없다
  const ownerId = await getCurrentUserId(req);
  if (!ownerId) return loginRequired();
  const owner = await store.getSession(parsed.data.subjectId);
  if (!owner || owner.userId !== ownerId) {
    return Response.json(
      { ok: false, error: { code: "NOT_FOUND", message: "해당 기록을 찾을 수 없습니다.", nextAction: "목록에서 다시 골라 주세요." } },
      { status: 404 },
    );
  }

  const materiality = judgeMateriality(parsed.data.changeSummary);

  // MATERIAL이면 의사 확인서를 함께 만든다 (FR-552 — 실질 변경만 재서명).
  // ⚠ 문서명에 "유언"을 쓰지 않는다 (FR-551). DocType은 INTENT_AFFIRMATION이고
  //    게이트 판정도 그 타입으로 받는다 — 원장이 판정을 흉내내지 않는다.
  // 노드보다 draft를 먼저 만든다. 노드는 append-only라 나중에 draftId를 채울 수 없다 —
  // 순서가 뒤집히면 "확인서 없는 MATERIAL 노드"가 영구히 남는다.
  let draftId: string | null = null;
  if (materiality === "MATERIAL") {
    try {
      const verdict = evaluateGate("INTENT_AFFIRMATION");
      const draft = await createDraft(parsed.data.subjectId, "INTENT_AFFIRMATION", verdict);
      draftId = draft.draftId;
    } catch (err) {
      // 확인서를 못 만들면 노드도 만들지 않는다. 재서명 없는 실질 변경을 남기면
      // 그게 나중에 "본인이 확인하지 않은 변경"으로 공격받는 자리가 된다
      console.warn("[ledger] 의사 확인서 생성 실패:", (err as Error).message);
      return bad(
        "AFFIRMATION_FAILED",
        "본인 확인서를 준비하지 못했습니다.",
        "잠시 후 다시 시도해 주세요. 이전 기록은 그대로 있습니다.",
        503,
      );
    }
  }

  try {
    await store.appendLedgerNode({
      ...parsed.data,
      materiality,
      draftId,
    });
  } catch {
    // 원인 문자열에는 subject_id·사유 원문이 섞일 수 있다 — 사용자에게 넘기지 않는다
    return bad(
      "LEDGER_APPEND_FAILED",
      "변경 이력을 남기지 못했습니다.",
      "잠시 후 다시 시도해 주세요. 이전 기록은 그대로 있습니다.",
      500,
    );
  }

  // 저장 직후 전체를 다시 읽어 검증한다 — 방금 쓴 노드만 믿으면 앞선 노드의
  // 변조를 영영 발견하지 못한다 (FR-553 수락 기준)
  const nodes = await store.listLedgerNodes(parsed.data.subjectId);

  return Response.json({
    ok: true,
    data: LedgerRes.parse({ nodes, chainValid: verifyChain(nodes) }),
  });
}
