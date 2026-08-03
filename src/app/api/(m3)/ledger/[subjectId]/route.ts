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
import { getCurrentUserId, loginRequired } from "@/lib/auth/session";
import { store } from "@/lib/store";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ subjectId: string }> },
) {
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();
  const { subjectId } = await ctx.params;

  // ⚠ 소유 확인 (2026-08-03 추가).
  //   전에는 **id만 알면 남의 뜻 이력이 통째로 보였다.** "유족 열람 경로가 아직
  //   설계되지 않아 열어 둔다"고 적어 뒀었는데, 그건 곧 **지금 아무나 볼 수 있다**는
  //   뜻이었다. 유족 접근은 어차피 별도 인증 경로로 만들 것이라(초대 + 확인 코드)
  //   지금 닫아도 나중에 막히는 것이 없다.
  //   subjectId는 intentId다 (intent_ledger_nodes.subject_id → intents.id).
  const session = await store.getSession(subjectId);
  if (!session || session.userId !== userId) {
    // 없는 것과 남의 것을 같은 응답으로 — 구분해 주면 남의 id를 탐색할 수 있다
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
