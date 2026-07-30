// M-RECONCILER — POST /api/cron/reconcile (FR-504 · 02.3 §4)
//
// 웹훅은 유실될 수 있다. 이 크론이 진행 중 문서의 외부 상태를 대조해 교정한다.
// 웹훅 아웃박스와 **같은 상태 머신**을 쓴다 — 두 벌이면 한쪽에서만 역행 방지가 참이 된다.
//
// 데모: 웹훅을 일부러 끊고 이걸 돌리면 상태가 따라잡힌다 (견고성 시연 지점).
import { ReconcileRes } from "@/lib/contracts";
import { signer } from "@/lib/signer";
import { canTransition } from "@/lib/signer/state-machine";
import { store } from "@/lib/store";
import { track } from "@/lib/observability/track";
import { ensureEvidence } from "@/app/api/(m0)/webhooks/modusign/outbox";

/** 이보다 오래 REQUESTED로 머문 문서를 의심한다 (02.3 §4 — 5분 주기) */
const STALE_MS = 5 * 60 * 1000;

export async function POST(req: Request) {
  const t0 = Date.now();
  // 데모·테스트에서 즉시 대상이 잡히도록 임계를 낮출 수 있다 (기본은 5분)
  const staleMs = Number(new URL(req.url).searchParams.get("staleMs") ?? STALE_MS);

  const stale = await store.listStaleRequestedDrafts(
    Number.isFinite(staleMs) ? staleMs : STALE_MS,
  );

  let corrected = 0;
  for (const draft of stale) {
    if (!draft.modusignDocumentId) continue;
    try {
      const doc = await signer.getDocument(draft.modusignDocumentId);
      if (!doc) continue;
      // 외부가 진실이다. 허용 전이일 때만 따라간다 (역행 방지)
      if (doc.status !== draft.status && canTransition(draft.status, doc.status)) {
        await store.syncDraftStatus(draft.draftId, doc.status, doc.rejectReason);
        corrected += 1;
      }
      // 웹훅이 유실됐다면 증빙도 없다 — 같은 불변식을 여기서도 보장한다 (FR-505)
      if (doc.status === "COMPLETED") {
        await ensureEvidence(draft.draftId, draft.modusignDocumentId, doc);
      }
    } catch (err) {
      // 한 건의 조회 실패가 나머지 교정을 막지 않는다
      console.warn(
        `[reconcile] ${draft.draftId} 조회 실패 — 건너뜀:`,
        (err as Error).message,
      );
    }
  }

  await store.recordReconcile(corrected);
  const state = await store.getReconcileState();
  track("CUSTODY", true, Date.now() - t0);

  return Response.json({
    ok: true,
    data: ReconcileRes.parse({
      corrected,
      lastSyncAt: state.lastSyncAt ?? new Date().toISOString(),
    }),
  });
}

/** 관리자 화면용 — 마지막 동기화·누적 교정 건수 (02.3 §4) */
export async function GET() {
  const state = await store.getReconcileState();
  return Response.json({ ok: true, data: state });
}
