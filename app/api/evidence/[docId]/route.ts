// M-EVIDENCE — GET /api/evidence/[docId] (FR-505)
// 읽기는 읽기만 한다 — 쓰기는 웹훅 아웃박스가 이미 끝냈고, evidences는 불변 트리거
// 대상이라 "없으면 만들어주기" 편의 로직은 트리거와 충돌한다.
import { EvidenceRes } from "@/lib/contracts";
import { getSession } from "@/lib/ai/session/store";
import { getDraft } from "@/app/api/documents/store";
import { store } from "@/lib/store";
import { getCurrentUserId } from "@/lib/auth/session";
import { issueEvidenceUrl } from "../sign-url";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ docId: string }> },
) {
  const { docId } = await ctx.params;

  // D-18 규율 — service role이므로 소유 필터는 라우트 코드가 명시한다.
  // 인증 비활성(키 없음)이면 DEV_USER_ID로 통과한다 (NFR-707)
  const currentUserId = await getCurrentUserId(req);

  const notFound = () =>
    Response.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "증빙을 찾을 수 없습니다.",
          nextAction: "서명이 완료된 뒤 다시 확인해 주세요.",
        },
      },
      { status: 404 },
    );

  const draft = await getDraft(docId);
  if (!draft) return notFound();

  const session = await getSession(draft.intentId);
  // 타인 소유는 존재 여부도 흘리지 않는다 — 403이 아니라 404
  if (!session || session.userId !== currentUserId) return notFound();

  const evidence = await store.getEvidenceByDraft(docId);
  if (!evidence) return notFound(); // 아직 미완료 — 증빙 없음

  return Response.json({
    ok: true,
    data: EvidenceRes.parse({
      // 15분 만료 서명 URL — 만료·서명 검증은 pdf 라우트가 한다 (D-10)
      pdfUrl: issueEvidenceUrl(new URL(req.url).origin, docId),
      signedAt: evidence.signedAt,
      parties: evidence.parties,
      // 저장된 해시 그대로 — 응답에서 재계산하면 "저장된 증빙"이 아니라 "지금 만든 값"이다
      hash: evidence.sha256,
    }),
  });
}
