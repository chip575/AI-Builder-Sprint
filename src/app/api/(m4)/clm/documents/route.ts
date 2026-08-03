// M-CLM — GET /api/clm/documents (서류 이력 목록)
//
// 시간축의 한 갈래다. 모두싸인에 있는 문서만이 아니라 **우리가 만든 문서 전부**를 준다 —
// 자필유언·마음 편지는 전자서명 대상이 아니라 외부에 존재하지 않으므로, 외부를 축으로
// 잡으면 목록에서 통째로 사라진다.
//
// ⚠ 소유자 필터가 유일한 방어선이다. 서비스 롤로 붙으므로 RLS가 걸러주지 않는다 (D-18).
import { DocStatus, DocType } from "@/lib/contracts";
import { getCurrentUserId, loginRequired } from "@/lib/auth/session";
import { DEV_USER_ID } from "@/lib/store/types";
import { store } from "@/lib/store";
import { syncExternalDelta } from "@/lib/signer/sync";

function bad(code: string, message: string, nextAction: string, status: number) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

export async function GET(req: Request) {
  const userId = await getCurrentUserId(req);

  // 인증이 가능한 환경인데 쿠키가 없으면 **목록을 주지 않는다.**
  // 비로그인은 전부 DEV_USER_ID를 공유하므로, 소유자 필터를 걸어도 익명 사용자끼리
  // 서로의 문서가 보인다. 한 건 조회와 달리 목록은 그 자체가 명세라 더 위험하다.
  // (키 없는 채점 경로는 authEnabled()가 false라 그대로 통과한다 — NFR-707)
  if (!userId) return loginRequired();

  const q = new URL(req.url).searchParams;

  // ?refresh=1 — 외부(모두싸인) 상태를 당겨와 맞춘 뒤 목록을 준다.
  // 매 조회마다 부르지 않는다: 조회는 공짜지만 왕복 지연이 목록 체감을 좌우한다.
  // 실패해도 목록은 준다 — 동기화 실패가 "서류가 없다"로 보이면 안 된다
  if (q.get("refresh") === "1") {
    const { lastSyncAt } = await store.getReconcileState();
    const res = await syncExternalDelta(lastSyncAt).catch((err) => {
      console.warn("[clm] 외부 동기화 실패 — 저장된 상태로 응답:", (err as Error).message);
      return null;
    });
    if (res && res.corrected > 0) await store.recordReconcile(res.corrected);
  }
  // 모르는 값은 **거부하지 않고 무시한다** — 필터 하나가 잘못됐다고 목록 전체가
  // 사라지면 사용자는 "서류가 없다"로 읽는다. 잘못된 부분집합보다 전체가 안전하다
  const docType = DocType.safeParse(q.get("docType"));
  const status = DocStatus.safeParse(q.get("status"));

  const documents = await store.listDocumentsByUser(userId, {
    ...(docType.success ? { docType: docType.data } : {}),
    ...(status.success ? { status: status.data } : {}),
    ...(q.get("from") ? { from: q.get("from")! } : {}),
    ...(q.get("to") ? { to: q.get("to")! } : {}),
  });

  return Response.json({
    ok: true,
    data: {
      documents: documents.map((d) => ({
        draftId: d.draftId,
        // 원장(Intent Ledger)의 subject는 draft가 아니라 **intent**다
        // (intent_ledger_nodes.subject_id → intents.id). 철회·이력이 이 값을 쓴다
        intentId: d.intentId,
        docType: d.docType,
        status: d.status,
        createdAt: d.createdAt,
        /** 게이트 판정 — 왜 서명할 수 없는 문서인지가 목록에서 보여야 한다 */
        verdict: d.verdict.verdict,
        /** 외부(모두싸인)에 대응 문서가 있는가. 자필유언은 없는 것이 정상이다 */
        hasExternal: Boolean(d.modusignDocumentId),
      })),
      /** 시연 규모 상한 없음 — 늘어나면 페이징을 넣는다. 잘렸으면 화면이 말해야 한다 */
      total: documents.length,
    },
  });
}
