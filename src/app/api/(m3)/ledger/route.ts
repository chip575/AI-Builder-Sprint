// M-LEDGER — POST /api/ledger (FR-551~553, FR-555)
// 뜻이 바뀐 사건 하나를 원장에 append한다. 수정·삭제 경로는 만들지 않는다 —
// 고칠 수 있는 이력은 이력이 아니다.
//
// 실질성 판정은 여기(코드)서 한다. 사용자가 등급을 고르게 하면 재서명을 피하려고
// 늘 MINOR를 고르게 되고, 그러면 등급이 아무것도 뜻하지 않게 된다 (FR-552).
import { LedgerNodeReq, LedgerRes } from "@/lib/contracts";
import { judgeMateriality, verifyChain } from "@/lib/ledger/chain";
import { store } from "@/lib/store";

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

  const materiality = judgeMateriality(parsed.data.changeSummary);

  try {
    await store.appendLedgerNode({
      ...parsed.data,
      materiality,
      // MATERIAL이면 의사 확인서 재서명이 뒤따른다 (FR-552) — 그 흐름은 M3 범위 밖이다
      draftId: null,
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
