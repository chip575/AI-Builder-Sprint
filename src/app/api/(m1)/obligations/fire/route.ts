// M-OBLIGATIONS — POST /api/obligations/fire (FR-204 · FR-508)
//
// 기한이 지난 약속을 발화한다. 발화는 **알림을 만드는 일**이지 문서를 바꾸는 일이 아니다 —
// 사용자가 돌아와서 직접 정하기 전까지 아무것도 확정되지 않는다 (P1).
//
// ⚠ 문구에 긴급성을 넣지 않는다 (FR-113 · NFR-708). 이건 독촉이 아니라 초대다.
//   기한 경과를 통보하는 문장이 아니라 "다시 살펴보실 때가 되었습니다"이다.
import { ObligationFireRes } from "@/lib/contracts";
import { store } from "@/lib/store";
import { track } from "@/lib/observability/track";

export async function POST(req: Request) {
  const t0 = Date.now();
  // 데모에서 임계를 옮길 수 있게 둔다. 기본은 지금 시각이다
  const now = new URL(req.url).searchParams.get("now") ?? new Date().toISOString();

  const due = await store.listDueObligations(now);
  const fired = [];
  for (const o of due) {
    const firedAt = new Date().toISOString();
    await store.markObligationFired(o.id, firedAt);
    // 실제 발송은 M1 범위 밖이다. 여기서는 "발화했다"는 사실만 남긴다 —
    // 발송 채널을 붙이는 것과 스케줄러가 도는 것은 다른 문제다
    await store
      .recordAudit("obligation.fired", o.subjectId, { kind: o.kind, obligationId: o.id })
      .catch(() => {});
    fired.push({ ...o, firedAt });
  }

  track("CUSTODY", true, Date.now() - t0);
  return Response.json({
    ok: true,
    data: ObligationFireRes.parse({ fired: fired.length, obligations: fired }),
  });
}

/** 현황 조회 — 관리 화면이 부른다 */
export async function GET(req: Request) {
  const subjectId = new URL(req.url).searchParams.get("subjectId") ?? undefined;
  const obligations = await store.listObligations(subjectId);
  return Response.json({
    ok: true,
    data: ObligationFireRes.parse({
      fired: obligations.filter((o) => o.firedAt).length,
      obligations,
    }),
  });
}
