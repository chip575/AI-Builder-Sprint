// M-LEDGER-REVOKE — POST /api/ledger/[subjectId]/revoke (FR-405 · 민법 §1108①)
//
// 철회는 **삭제가 아니라 그 위에 얹는 새로운 사실**이다. "그때 약정했고, 나중에
// 철회했다" 둘 다 참이고 둘 다 남아야 한다 (P5).
//
// 그래서 문서 상태(DocStatus)를 건드리지 않는다:
//   · COMPLETED → CANCELED는 **역행 전이**라 canTransition이 막는다. 뚫으면
//     웹훅 동기화가 깨진다 (외부에서 온 COMPLETED와 우리 CANCELED가 매 턴 싸운다)
//   · 서명된 증빙(해시·서명 시각)은 철회 뒤에도 그대로 있어야 한다
//
// 대신 원장을 쓴다. ACTIVE/SUPERSEDED는 순서에서 유도되지만 REVOKED는 저장값이라
// (chain.ts: "철회는 사용자의 행위지 순서의 결과가 아니다"), 전부 REVOKED가 되면
// 유도에서 다 빠져 **살아 있는 뜻이 없어진다.**
//
// 통지는 여기서 보내지 않는다. 상대에게 무언가를 보내는 일은 사용자가 확인 화면에서
// 한 번 더 눌러야 한다 — 서명 요청과 같은 규약이다.
import { LedgerRes, RevokeReq } from "@/lib/contracts";
import { verifyChain, withDerivedStatus } from "@/lib/ledger/chain";
import { canRevoke, revocationRule } from "@/lib/rules/revocation";
import { getCurrentUserId, loginRequired } from "@/lib/auth/session";
import { store } from "@/lib/store";

function err(code: string, message: string, nextAction: string, status: number) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ subjectId: string }> },
) {
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();
  const { subjectId } = await ctx.params;

  const parsed = RevokeReq.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return err(
      "INVALID_REQUEST",
      "철회 사유를 저장하지 못했습니다.",
      "왜 그만두시는지 한 줄로 적어 주세요.",
      400,
    );
  }

  // ── 소유 확인 ──
  // subjectId는 draftId다 (원장의 주체 = 그 문서). 남의 문서를 철회하면 그 사람의
  // 약정이 사라지므로, GET과 달리 여기서는 반드시 건다.
  // ⚠ GET /api/ledger/[subjectId]에는 이 검사가 없다 — 유족 열람 경로가 아직
  //   설계되지 않아 열어 둔 상태다. 열람권 매트릭스와 함께 닫아야 한다 (별건).
  const mine = await store.listDocumentsByUser(userId);
  const draft = mine.find((d) => d.draftId === subjectId);
  if (!draft) {
    // 없는 것과 남의 것을 같은 응답으로 돌려준다 — 구분해 주면 남의 id를 탐색할 수 있다
    return err("NOT_FOUND", "해당 약정을 찾을 수 없습니다.", "목록에서 다시 골라 주세요.", 404);
  }

  // ── 철회할 수 있는 문서인가 ──
  // 네 단어(취소·철회·해지·회수)를 한 버튼에 몰지 않는다. 정기후원에 "철회"를
  // 누르면 이미 낸 돈이 돌아오는 줄 안다 (lib/rules/revocation)
  const rule = revocationRule(draft.docType);
  if (!canRevoke(draft.docType)) {
    return err("NOT_REVOCABLE", rule.note, rule.label || "다른 방법을 안내해 드립니다.", 409);
  }

  const before = await store.listLedgerNodes(subjectId);
  if (before.length === 0) {
    return err("NOT_FOUND", "해당 이력을 찾을 수 없습니다.", "목록에서 다시 골라 주세요.", 404);
  }
  if (before.every((n) => n.status === "REVOKED")) {
    // 두 번 눌러도 노드가 쌓이지 않게 한다. 멱등이 아니면 이력이 "철회, 철회, 철회"가 된다
    return err("ALREADY_REVOKED", "이미 철회하신 약정입니다.", "이력에서 확인하실 수 있습니다.", 409);
  }

  // ── 철회 노드를 먼저 쌓는다 ──
  // 사유·시점·해시가 남는 자리가 여기뿐이다. 노드 없이 상태만 바꾸면 "언제 왜
  // 철회했는가"가 사라지고, 남는 것은 "사라졌다"는 사실뿐이다.
  // MATERIAL — 뜻 자체가 바뀌는 변경이다 (FR-552)
  await store.appendLedgerNode({
    subjectId,
    changeSummary: { revoked: true, docType: draft.docType },
    changeReason: parsed.data.changeReason,
    materiality: "MATERIAL",
  });

  // 방금 쌓은 노드까지 포함해 전부 REVOKED로. 그래야 유도에서 ACTIVE가 사라진다
  await store.revokeLedgerSubject(subjectId);

  const after = await store.listLedgerNodes(subjectId);
  return Response.json({
    ok: true,
    data: {
      ...LedgerRes.parse({
        nodes: withDerivedStatus(after),
        // 검증은 **저장된 그대로**에 대해 한다 (GET과 같은 규약).
        // status는 봉인 대상이 아니므로 철회로 해시가 깨지지 않는다
        chainValid: verifyChain(after),
      }),
      // 통지는 아직 보내지 않았다. 화면이 이 값으로 확인 단계를 띄운다
      notifyRecipientId: parsed.data.notifyRecipientId ?? null,
    },
  });
}
