// 외부 상태 델타 동기화 (CLM 3단계)
//
// 방향이 중요하다: **밀어넣지 않고 당겨온다.**
//   모두싸인 이벤트를 방아쇠로 여러 저장소에 갱신 명령을 뿌리면(팬아웃) 부분 실패가
//   조용히 어긋남으로 남는다 — A는 갱신되고 B는 실패했는데 그 사실을 기록할 곳이 없다.
//   웹훅은 유실되므로(그래서 리컨실러가 있다) 손해가 곱해진다.
//   당겨오면 멱등하고 자가치유다: 몇 번 돌려도 같고, 한 번 걸러 먹어도 다음이 따라잡는다.
//
// 리컨실러(cron)와의 차이: 리컨실러는 **우리가 아는 draft**를 하나씩 확인한다(N회).
// 이쪽은 **외부에서 바뀐 것**을 한 번에 받아 우리 것과 맞춘다(1회). 둘은 겹쳐도 안전하다 —
// 같은 전이 규칙(canTransition)을 쓰고 역행을 허용하지 않기 때문이다.
import { signer } from ".";
import { canTransition } from "./state-machine";
import { store } from "../store";

/** metadatas에 심어 둔 역참조 키 (02.3 §1) */
const META_DRAFT_ID = "draftId";

export interface SyncResult {
  /** 조회해 온 외부 문서 수 */
  scanned: number;
  /** 실제로 우리 상태를 고친 수 */
  corrected: number;
  /** 다음 델타의 기준점. 이번에 본 것 중 가장 최근 갱신 시각 */
  cursor: string | null;
}

/**
 * 마지막 동기화 이후 바뀐 외부 문서를 받아 우리 draft 상태를 맞춘다.
 *
 * @param since 이 시각 이후 갱신분만. null이면 최근분(limit까지)을 받는다
 */
export async function syncExternalDelta(since?: string | null): Promise<SyncResult> {
  const docs = await signer.listDocuments({
    updatedSince: since ?? null,
    limit: 100,
  });

  let corrected = 0;
  let cursor: string | null = null;

  for (const doc of docs) {
    if (doc.updatedAt && (cursor === null || doc.updatedAt > cursor)) cursor = doc.updatedAt;

    // 역참조가 없으면 우리 문서가 아니다 — 같은 계정으로 보낸 다른 문서일 수 있다.
    // 모르는 것은 건드리지 않는다
    const draftId = doc.metadata?.[META_DRAFT_ID];
    if (!draftId) continue;

    const draft = await store.getDraft(draftId).catch(() => undefined);
    if (!draft) continue;

    // 외부가 진실이다. 단 **허용된 전이일 때만** 따라간다 — 역행하면 완료가 대기로 돌아간다
    if (doc.status !== draft.status && canTransition(draft.status, doc.status)) {
      await store.syncDraftStatus(draft.draftId, doc.status, doc.rejectReason);
      corrected += 1;
    }
  }

  return { scanned: docs.length, corrected, cursor };
}
