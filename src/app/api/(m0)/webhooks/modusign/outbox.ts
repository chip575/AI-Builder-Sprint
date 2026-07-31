// M-WEBHOOK — 아웃박스 드레인 (FR-503 · 02.3 §3 4~9단계)
// 부수효과(상태 전이·증빙 생성)는 processed_at IS NULL인 이벤트에서만 실행된다.
// 라우트는 이걸 fire-and-forget으로 부르고 즉시 200을 반환한다 (10초 제한 회피).
// 드레인 자체도 멱등이다 — 몇 번을 다시 돌아도 처리된 이벤트는 건너뛴다.
import { createHash } from "node:crypto";
import { signer } from "@/lib/signer";
import { canTransition, EVENT_TO_STATUS } from "@/lib/signer/state-machine";
import { store } from "@/lib/store";
import { track } from "@/lib/observability/track";

export async function drainOutbox(): Promise<void> {
  const pending = await store.listUnprocessedEvents();

  for (const event of pending) {
    const t0 = Date.now();
    try {
      await processOne(event.modusignDocumentId, event.event, event.payload);
    } catch (err) {
      // 처리 실패 이벤트는 미처리로 남긴다 — 다음 드레인·리컨실러가 재시도 (FR-504)
      console.warn(`[webhook] 이벤트 ${event.id} 처리 실패 — 미처리 유지:`, (err as Error).message);
      continue;
    }
    await store.markEventProcessed(event.id);
    track("CUSTODY", true, Date.now() - t0);
  }
}

async function processOne(
  documentId: string | null | undefined,
  event: string,
  payload: unknown,
): Promise<void> {
  if (!documentId) return; // 문서 없는 이벤트 — 기록만 남기고 종료

  // 웹훅은 문서 ID만 준다 → 상세 조회로 상태·거절 사유 보강 (02.3 §3 5단계)
  const doc = await signer.getDocument(documentId);

  // 역참조: modusign_document_id 우선, 없으면 요청 시 심어둔 metadata.draftId (02.3 §1)
  let draft = await store.findDraftByDocumentId(documentId);
  if (!draft) {
    const metaDraftId = (payload as { metadata?: { draftId?: string } })?.metadata?.draftId;
    if (metaDraftId) draft = await store.getDraft(metaDraftId);
  }
  if (!draft) {
    // draft가 아니면 가족 인지 서명일 수 있다 (FR-554).
    // 가족의 응답을 별도 API로 받지 않는 이유가 여기 있다 — "인지했다"는 기록에
    // 서명이라는 근거가 항상 붙는다. 상태 매핑은 본인 서명과 같은 어휘를 쓴다.
    const ackStatus = EVENT_TO_STATUS[event];
    if (ackStatus === "COMPLETED" || ackStatus === "REJECTED") {
      const ack = await store.resolveFamilyAck(
        documentId,
        ackStatus === "COMPLETED" ? "ACKNOWLEDGED" : "DECLINED",
        doc?.rejectReason ?? null,
      );
      // 거부여도 본인 확인서는 건드리지 않는다. 거부 사실만 남는다 (FR-554)
      if (ack) return;
    }
    // 모르는 문서 — 200은 이미 나갔고, 여기선 로그만. 재시도를 유발하지 않는다
    console.warn(`[webhook] 대응 draft 없음 — documentId=${documentId}, event=${event}`);
    return;
  }

  const target = doc?.status ?? EVENT_TO_STATUS[event];
  if (!target) return; // 모르는 이벤트 유형 — 무시

  if (canTransition(draft.status, target)) {
    await store.syncDraftStatus(draft.draftId, target, doc?.rejectReason ?? undefined);
  } else if (draft.status !== target) {
    // 역행·중복 전이는 스킵 + 로그 (02.3 §3 — 이벤트 순서 보장 없음)
    console.warn(`[webhook] 전이 스킵 ${draft.status} → ${target} (draft=${draft.draftId})`);
    return;
  }

  // ⚠ 증빙 확보를 전이 성공에 묶지 않는다.
  //    폴링(GET status)이 먼저 COMPLETED로 동기화하면 여기서 전이가 '불가'가 되고,
  //    그러면 증빙이 영원히 생성되지 않는다 (실제로 났던 경합).
  //    "완료 상태이면 증빙이 있어야 한다"가 불변식이고, 누가 먼저 도착했는지는 무관하다.
  if (target === "COMPLETED") {
    await ensureEvidence(draft.draftId, documentId, doc);
  }
  // Obligation 생성(02.3 §3 8단계)은 M-OBLIGATIONS(M1) — 정기후원 체결 시 여기 연결
}

/** 완료 문서의 증빙을 보장한다 (FR-505). 이미 있으면 아무것도 하지 않는다 — 멱등 */
export async function ensureEvidence(
  draftId: string,
  documentId: string,
  doc: { completedAt?: string | null; parties?: unknown[] } | null,
): Promise<void> {
  const existing = await store.getEvidenceByDraft(draftId);
  if (existing) return;
  const signedAt = doc?.completedAt ?? new Date().toISOString();
  try {
    await store.createEvidence({
      draftId,
      pdfStoragePath: `evidences/${draftId}.pdf`,
      // mock — 실 연동에서는 다운로드한 PDF 바이트의 해시 (FR-505)
      sha256: createHash("sha256").update(`${documentId}:${signedAt}`).digest("hex"),
      signedAt,
      parties: doc?.parties ?? [],
    });
  } catch (err) {
    // 확인과 삽입 사이에 웹훅·폴링·리컨실러 중 다른 경로가 먼저 넣을 수 있다.
    // draft_id UNIQUE가 최종 방어이고, 위반은 "이미 목표 상태"라는 뜻이므로 성공으로 읽는다.
    if (await store.getEvidenceByDraft(draftId)) return;
    throw err;
  }
}
