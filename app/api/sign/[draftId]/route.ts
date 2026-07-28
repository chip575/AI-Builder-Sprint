// M-SIGN — POST /api/sign/[draftId] (FR-501 · FR-502)
// 게이트 재검증이 여기 또 있다 — draft가 어떻게 만들어졌든 ESIGN_OK가 아니면
// 서명 요청 자체가 불가능하다 (FR-104 "어떤 경로로든 서명 API를 호출하면 서버가 차단").
import { SignReq, SignRes } from "@/lib/contracts";
import { signer } from "@/lib/signer";
import { track } from "@/lib/observability/track";
import { getDraft } from "../../documents/store";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ draftId: string }> },
) {
  const t0 = Date.now(); // NFR-709 관측 지점
  const { draftId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = SignReq.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "요청 형식이 올바르지 않습니다.",
          nextAction: "서명 방식을 선택해 주세요.",
        },
      },
      { status: 400 },
    );
  }

  const draft = getDraft(draftId);
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

  // 방어선 2중화 — documents가 막았어도 여기서 다시 확인한다 (P2, UI 우회 불가)
  if (draft.verdict.verdict !== "ESIGN_OK") {
    track("SIGN", false, Date.now() - t0);
    return Response.json(
      {
        ok: false,
        error: {
          code: "GATE_BLOCKED",
          message: `이 문서는 전자서명 대상이 아닙니다 (${draft.verdict.statutes.map((s) => s.id).join(", ")}).`,
          nextAction: "안내된 대체 경로를 이용해 주세요.",
        },
      },
      { status: 403 },
    );
  }

  if (draft.status !== "DRAFT") {
    return Response.json(
      {
        ok: false,
        error: {
          code: "ALREADY_REQUESTED",
          message: "이미 서명 요청이 진행 중입니다.",
          nextAction: "서명 상태를 확인해 주세요.",
        },
      },
      { status: 409 },
    );
  }

  // 서명 요청 — 실패 시 draft는 DRAFT 그대로다. 부분 상태로 남지 않는다 (FR-501)
  const input = {
    templateKey: draft.docType,
    draftId: draft.draftId,
    signerName: "김가상", // M-AUTH 연결 전 임시 — 시드는 전량 가상 인물 (보안 4조)
    signerEmail: "fake@example.com",
  };
  let result;
  try {
    result =
      parsed.data.mode === "EMBED"
        ? await signer.createEmbeddedDraft(input)
        : await signer.requestWithTemplate(input);
  } catch {
    track("SIGN", false, Date.now() - t0);
    return Response.json(
      {
        ok: false,
        error: {
          code: "SIGN_REQUEST_FAILED",
          message: "잠시 문제가 있었어요.",
          nextAction: "다시 시도할까요?",
        },
      },
      { status: 502 },
    );
  }

  draft.modusignDocumentId = result.documentId;
  draft.status = "REQUESTED";
  track("SIGN", true, Date.now() - t0);

  return Response.json({
    ok: true,
    data: SignRes.parse({
      signUrl: parsed.data.mode === "LINK" ? result.embeddedUrl : null,
      embedUrl: parsed.data.mode === "EMBED" ? result.embeddedUrl : null,
      expiresAt: result.expiresAt,
    }),
  });
}
