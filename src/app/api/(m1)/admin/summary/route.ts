// M-ADMIN-OPS — GET /api/admin/summary (FR-601 · FR-604 · FR-605)
//
// 기관이 보는 한 화면. 계약(AdminSummaryRes)에 있는 항목만 채운다 —
// 일괄 리마인드(FR-603)는 계약이 없어 이 라우트에 없다. 없는 것을 있는 척하지 않는다.
//
// ⚠ 기부자 표시명은 **마스킹된 참조**다. 우리는 이름을 저장하지 않으므로(NFR-714)
//   여기서 이름을 만들어낼 수도 없다. 문서 식별용 꼬리만 보인다.
import { AdminSummaryRes } from "@/lib/contracts";
import { store } from "@/lib/store";

export async function GET() {
  const [byStatus, gate, reconcile, obligations] = await Promise.all([
    store.countDraftsByStatus(),
    store.getGateStats(),
    store.getReconcileState(),
    store.listObligations(),
  ]);

  // 갱신 도래 — 아직 발화되지 않은 정기후원 갱신 약속 (FR-604)
  const renewalDue = obligations
    .filter((o) => o.kind === "RECURRING_RENEWAL" && !o.firedAt)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .map((o) => ({
      docId: o.subjectId,
      // 이름 대신 문서 꼬리 4자. 담당자가 문서를 특정하기엔 충분하고
      // 명단이 유출돼도 사람을 식별할 수 없다
      donorName: `기부자 …${o.subjectId.slice(-4)}`,
      dueAt: o.dueAt,
    }));

  return Response.json({
    ok: true,
    data: AdminSummaryRes.parse({
      byStatus,
      renewalDue,
      gateBlockedCount: gate.blockedTotal,
      lastSyncAt: reconcile.lastSyncAt,
      reconcileCorrected: reconcile.correctedTotal,
    }),
  });
}
