// M-LEDGER — GET /api/ledger/[subjectId] (FR-556)
//
// 유족이 보는 화면의 데이터원이다. 두 가지를 함께 준다:
//   · nodes      — 시간순 이력. status는 저장값이 아니라 매번 유도한 값이다 (FR-555)
//   · chainValid — 해시 체인 검증 결과. 이 화면의 존재 이유가 이 한 값이다
//
// chainValid가 false여도 200으로 nodes를 준다. 숨기면 "무언가 잘못됐다"는 사실까지
// 사라진다 — 유족이 알아야 할 것은 이력의 존재가 아니라 이력이 온전한지 여부다.
import { LedgerRes } from "@/lib/contracts";
import { verifyChain, withDerivedStatus } from "@/lib/ledger/chain";
import { store } from "@/lib/store";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ subjectId: string }> },
) {
  const { subjectId } = await ctx.params;

  const raw = await store.listLedgerNodes(subjectId);
  if (raw.length === 0) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "해당 이력을 찾을 수 없습니다.",
          nextAction: "주소를 다시 확인해 주세요.",
        },
      },
      { status: 404 },
    );
  }

  // 검증은 **저장된 그대로**에 대해 한다. 상태를 유도한 뒤에 검증하면
  // 우리가 방금 바꾼 값으로 해시를 재계산하게 되어 언제나 통과한다.
  const chainValid = verifyChain(raw);

  // 열람 사실을 남긴다 (FR-556). 기록 실패가 화면을 막지 않는다 —
  // 관측이 기능을 죽이지 않는다는 원칙은 여기서도 같다
  await store
    .recordAudit("ledger.view", subjectId, { nodeCount: raw.length, chainValid })
    .catch(() => {});

  return Response.json({
    ok: true,
    data: LedgerRes.parse({ nodes: withDerivedStatus(raw), chainValid }),
  });
}
