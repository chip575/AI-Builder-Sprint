// M-SIGN — POST /api/sign/[draftId] (FR-501 · FR-502)
// 게이트 재검증이 여기 또 있다 — draft가 어떻게 만들어졌든 ESIGN_OK가 아니면
// 서명 요청 자체가 불가능하다 (FR-104 "어떤 경로로든 서명 API를 호출하면 서버가 차단").
import { SignReq, SignRes } from "@/lib/contracts";
import { signer } from "@/lib/signer";
import { track } from "@/lib/observability/track";
import { logGateVerdict } from "@/lib/observability/gate-log";
import { getDraft, markDraftRequested } from "../../documents/store";
import { getCurrentUser } from "@/lib/auth/session";
import { store } from "@/lib/store";
import { effectiveProfile } from "../../me/route";
import { getSession } from "@/lib/ai/session/store";

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

  const draft = await getDraft(draftId);
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
    // 서명 경로에서 막힌 것 — FR-509 카운터가 세는 바로 그 사건.
    // 정책적 차단이므로 pipeline_metrics.fail(장애)로는 세지 않는다
    logGateVerdict(draft.docType, draft.verdict, true);
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
  // 서명자는 **로그인한 사람**이다. 예전에는 "김가상"/"fake@example.com"이 하드코딩돼
  // 있었다(M-AUTH 연결 전 임시). 인증이 붙은 뒤에도 남아 있어서, real 모드에서는
  // 서명 요청이 존재하지 않는 주소로 나갔다 (2026-08-02 실측).
  const user = await getCurrentUser(req);
  // 마이페이지 값이 서식에 인쇄된다. 비어 있으면 대체값을 넣는다 —
  // 빈칸으로 서명되는 것보다 낫고, 임의의 가짜 번호를 찍는 것보다 정직하다
  const profile = user ? await store.getProfile(user.id) : undefined;
  const eff = user
    ? effectiveProfile(user.email, profile)
    : { displayName: "김가상", contact: "fake@example.com", orgName: null };
  const signerEmail = user?.email ?? "fake@example.com"; // 인증 비활성(mock) 경로
  const signerName = eff.displayName;

  // 서면에 인쇄될 값 — 대화에서 확정된 fact로 채운다.
  // 채우지 못한 필수 칸은 어댑터의 검증이 잡아 **거부**한다. 빈칸으로 서명되는 것보다
  // 요청이 실패하는 편이 낫다 (template-fields 주석 참조)
  const session = await getSession(draft.intentId);
  const fact = (key: string) =>
    session?.facts.find((f) => f.key === key && f.confirmed)?.value;
  const fields: Record<string, unknown> = {
    donor_name: signerName,
    donor_contact: eff.contact,
    // ⚠ region으로 대체하지 않는다 — "부산"을 기관 명칭 칸에 인쇄하면 계약서가
    //   존재하지 않는 기관을 가리킨다. 없으면 비운 채로 검증에 걸리게 둔다
    org_name: fact("orgName") ?? eff.orgName,
    amount_krw: fact("amount"),
    donation_date: new Date().toISOString().slice(0, 10),
  };

  const input = {
    templateKey: draft.docType,
    draftId: draft.draftId,
    signerName,
    signerEmail,
    fields,
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

  await markDraftRequested(draft.draftId, result.documentId);
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
