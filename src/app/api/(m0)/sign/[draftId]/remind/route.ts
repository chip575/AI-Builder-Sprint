// M-SIGN-LIFECYCLE — POST /api/sign/[draftId]/remind (FR-507)
// 누구에게 보낼지는 입력에 없다. 미서명자는 서버가 parties[].signedAt로 이미 안다 —
// 수신자를 입력으로 받으면 이미 서명한 사람에게 재발송하는 경로가 열린다.
// 임계 이전 요청은 실패가 아니라 "아직 때가 아니다"로 돌려보낸다 (NFR-705 · NFR-708).
import { RemindReq, RemindRes } from "@/lib/contracts";
import { signer } from "@/lib/signer";
import { recordRemind, remindAvailableAt, remindHistory, tooEarlyCopy } from "@/lib/signer/remind";
import { getDraft } from "../../../documents/store";
import { getCurrentUserId, loginRequired } from "@/lib/auth/session";
import { store } from "@/lib/store";

function fail(status: number, code: string, message: string, nextAction: string) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

/** 진행 중이 아닌 문서의 안내 — 거절은 실패가 아니라 상대의 의사다.
 *  문구가 사용자를 탓하지 않게 한다 (NFR-708). */
const NOT_PENDING: Record<string, { message: string; nextAction: string }> = {
  COMPLETED: { message: "이미 서명이 끝난 문서예요.", nextAction: "증빙을 확인해 보세요." },
  REJECTED: {
    message: "상대가 서명하지 않기로 한 문서예요.",
    nextAction: "어떤 마음이었는지 이야기 나눠 보셔도 좋아요.",
  },
  CANCELED: { message: "취소된 문서예요.", nextAction: "필요하시면 새로 요청하실 수 있어요." },
  DRAFT: { message: "아직 서명 요청 전이에요.", nextAction: "먼저 서명을 요청해 주세요." },
};

export async function POST(req: Request, ctx: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await ctx.params;

  const parsed = RemindReq.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(
      400,
      "INVALID_REQUEST",
      "요청 형식이 올바르지 않습니다.",
      "문서 화면에서 다시 시도해 주세요.",
    );
  }

  // 🔴 경로가 정본이다. 두 출처가 조용히 갈리면 남의 문서에 리마인드를 보내는 경로가 된다.
  //    계약은 이걸 강제할 수 없다 — 이 분기와 그 테스트가 유일한 방어선이다.
  if (parsed.data.draftId !== draftId) {
    return fail(
      400,
      "DRAFT_ID_MISMATCH",
      "문서 정보가 일치하지 않습니다.",
      "문서 화면에서 다시 시도해 주세요.",
    );
  }

  // 소유 확인 (2026-08-03) — draftId만 알면 **남의 문서에 대해 알림 메일을 보낼 수
  // 있었다.** 발송은 되돌릴 수 없고, 받는 사람에게는 우리 이름으로 간다
  const ownerId = await getCurrentUserId(req);
  if (!ownerId) return loginRequired();
  const owned = new Set((await store.listDocumentsByUser(ownerId)).map((d) => d.draftId));
  const draft = owned.has(draftId) ? await getDraft(draftId) : undefined;
  if (!draft) {
    return fail(404, "NOT_FOUND", "해당 문서를 찾을 수 없습니다.", "문서를 먼저 생성해 주세요.");
  }
  if (!draft.modusignDocumentId) {
    return fail(409, "NOT_REQUESTED", NOT_PENDING.DRAFT!.message, NOT_PENDING.DRAFT!.nextAction);
  }

  // 판정 근거는 외부 상태다 — 웹훅이 유실돼 로컬이 REQUESTED로 남아 있어도
  // 이미 끝난 문서에 리마인드를 보내지 않는다.
  const doc = await signer.getDocument(draft.modusignDocumentId);
  if (!doc) {
    return fail(
      502,
      "EXTERNAL_NOT_FOUND",
      "잠시 문제가 있었어요.",
      "잠시 후 다시 시도할까요?",
    );
  }
  if (doc.status !== "REQUESTED") {
    const copy = NOT_PENDING[doc.status] ?? NOT_PENDING.DRAFT!;
    return fail(409, "NOT_PENDING", copy.message, copy.nextAction);
  }

  const pending = doc.parties.filter((p) => p.role === "SIGNER" && !p.signedAt);
  if (pending.length === 0) {
    return fail(409, "ALL_SIGNED", "모두 서명을 마쳤어요.", "서명 상태를 확인해 보세요.");
  }

  // 요청 시각 = 발신자 쪽 시작 시각 (real: startedAt · mock: 문서 생성 시각).
  // 외부가 주지 않으면 초안 생성 시각으로 물러선다.
  const startedAt = doc.parties.find((p) => p.role === "REQUESTER")?.signedAt;
  // 직전 리마인드 시각까지 본다 — 임계가 지난 뒤 연속으로 보내지지 않게 (FR-113)
  const history = await remindHistory(draftId);
  const availableAt = remindAvailableAt(startedAt, draft.createdAt, history.lastAt);
  const now = new Date();
  if (now < availableAt) {
    const copy = tooEarlyCopy(availableAt, now);
    return fail(409, "TOO_EARLY", copy.message, copy.nextAction);
  }

  try {
    await signer.resendNotification(draft.modusignDocumentId);
  } catch {
    return fail(502, "REMIND_FAILED", "잠시 문제가 있었어요.", "잠시 후 다시 시도할까요?");
  }

  const sentAt = new Date().toISOString();
  const remindCount = await recordRemind(draftId, sentAt, pending.length);

  return Response.json({ ok: true, data: RemindRes.parse({ sentAt, remindCount }) });
}
