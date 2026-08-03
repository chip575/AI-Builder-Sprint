// M-SIGN — GET /api/sign/[draftId]/status (3초 폴링 · 02.4 §0)
// 외부(signer) 상태를 읽어 로컬 draft에 반영한다. 웹훅(M-WEBHOOK)과 같은
// 상태 머신을 공유하며, 웹훅 유실 시에도 폴링이 상태를 따라잡는다.
import { SignStatusRes } from "@/lib/contracts";
import { signer } from "@/lib/signer";
import { getDraft, syncDraftStatus } from "../../../documents/store";
import { getCurrentUserId, loginRequired } from "@/lib/auth/session";
import { store } from "@/lib/store";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await ctx.params;
  // 소유 확인 (2026-08-03) — draftId만 알면 남의 서명 진행 상태가 보였다
  const ownerId = await getCurrentUserId(req);
  if (!ownerId) return loginRequired();
  const owned = new Set((await store.listDocumentsByUser(ownerId)).map((d) => d.draftId));
  const draft = owned.has(draftId) ? await getDraft(draftId) : undefined;
  if (!draft) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "해당 문서를 찾을 수 없습니다.",
          nextAction: "문서를 먼저 생성해 주세요.",
        },
      },
      { status: 404 },
    );
  }

  if (!draft.modusignDocumentId) {
    return Response.json({
      ok: true,
      data: SignStatusRes.parse({
        status: draft.status, // 아직 DRAFT — 서명 요청 전
        parties: [],
        completedAt: null,
        rejectReason: null,
      }),
    });
  }

  const doc = await signer.getDocument(draft.modusignDocumentId);
  if (!doc) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "EXTERNAL_NOT_FOUND",
          message: "서명 진행 정보를 불러오지 못했습니다.",
          nextAction: "잠시 후 다시 시도해 주세요.",
        },
      },
      { status: 502 },
    );
  }

  // 폴링 동기화 — 허용 전이는 signer 상태 머신이 이미 보장
  await syncDraftStatus(draft.draftId, doc.status, doc.rejectReason);

  return Response.json({
    ok: true,
    data: SignStatusRes.parse({
      status: doc.status,
      parties: doc.parties,
      completedAt: doc.completedAt,
      rejectReason: doc.rejectReason,
    }),
  });
}
