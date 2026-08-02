// M-CUSTODIAN — GET/POST/DELETE /api/estate/custodians (FR-405 · NFR-713)
//
// 지킴이 초대. 템플릿·계약·DB 테이블이 전부 준비돼 있었는데 **막혀 있었다** —
// `CustodianInviteReq.recipientId`가 존재하지 않는 테이블을 가리켰기 때문이다.
// recipients가 생기면서 풀렸다.
//
// ⚠ 지킴이는 **유언집행자가 아니다** (00.2 §7.1 · D-09). 화면 표기는 "지킴이"이고,
//   약정서 본문의 고지는 템플릿 소관이다.
// ⚠ 열람 권한의 기준은 `grantedAt`이다 — **지킴이가 서명해야** 열린다.
//   PENDING = 열람 0건이고 그것이 기본값이라, 조용히 열리는 경로가 없다.
// ⚠ 열람 범위(viewScope)는 빈 배열이 기본이고 **그것이 최소 권한이다.**
//   빠뜨리면 전체가 열리는 시그니처는 언젠가 빠뜨린다 (D-18).
import { CustodianInviteReq, CustodianInviteRes } from "@/lib/contracts";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { getCurrentUser, loginRequired } from "@/lib/auth/session";
import { signer } from "@/lib/signer";
import { store } from "@/lib/store";

function err(code: string, message: string, nextAction: string, status: number) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return loginRequired();
  return Response.json({ ok: true, data: { custodians: await store.listCustodians(user.id) } });
}

export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return loginRequired();

  const parsed = CustodianInviteReq.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return err("INVALID_REQUEST", "초대 내용을 저장하지 못했습니다.", "성함과 열람 범위를 확인해 주세요.", 400);
  }

  // 상대는 주소록에 있어야 한다 — 여기서 이메일을 직접 받지 않는다.
  // 받으면 같은 사람이 여러 곳에 다른 주소로 쌓인다
  const people = await store.listRecipients(user.id, "CUSTODIAN");
  const to = people.find((r) => r.id === parsed.data.recipientId);
  if (!to) {
    return err("NOT_FOUND", "그 분을 찾을 수 없습니다.", "‘알릴 분’에 지킴이로 먼저 등록해 주세요.", 404);
  }

  // 협조 약정서는 서명 대상이다 (게이트 ESIGN_OK). 서명이 곧 초대 수락이다
  const verdict = evaluateGate("CUSTODIAN_AGREEMENT");
  const session = await store.getOrCreateSession(null, user.id);
  const draft = await store.createDraft(session.id, "CUSTODIAN_AGREEMENT", verdict);

  const custodian = await store.upsertCustodian(user.id, {
    recipientId: to.id,
    displayName: parsed.data.displayName,
    viewScope: parsed.data.viewScope,
    agreementDraftId: draft.draftId,
  });

  try {
    const result = await signer.requestWithTemplate({
      templateKey: "CUSTODIAN_AGREEMENT",
      draftId: draft.draftId,
      // 서명자는 **지킴이 본인**이다 (TEMPLATE_ROLES.CUSTODIAN = ["지킴이"]).
      // 본인이 서명하는 서식이 아니라 상대가 수락하는 서식이다
      signerName: parsed.data.displayName,
      signerEmail: to.email,
      fields: {
        custodian_name: parsed.data.displayName,
        // 범위를 사람 말로 적는다 — 코드값이 약정서에 인쇄되면 무엇을 허락한 것인지 모른다
        view_scope:
          parsed.data.viewScope.length > 0
            ? parsed.data.viewScope.join(", ")
            : "지정된 범위 없음",
        duties: "남기신 뜻과 자산 목록을 정해진 범위에서 열람하고, 필요한 절차에 협조합니다.",
      },
    });
    await store.markDraftRequested(draft.draftId, result.documentId);
  } catch (e) {
    // 조용히 성공으로 넘기지 않는다 (보안 7조) — 안 갔는데 갔다고 하면
    // 사용자는 지킴이가 초대를 받은 줄 안다
    console.warn("[custodian] 초대 발송 실패:", (e as Error).message);
    return err(
      "SIGN_REQUEST_FAILED",
      "초대를 보내지 못했습니다.",
      "잠시 뒤 다시 시도해 주세요. 열람 권한은 아직 열리지 않았습니다.",
      502,
    );
  }

  return Response.json({
    ok: true,
    data: CustodianInviteRes.parse({ custodian, draftId: draft.draftId }),
  });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return loginRequired();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return err("INVALID_REQUEST", "거둘 권한을 찾지 못했습니다.", "다시 시도해 주세요.", 400);

  // 회수는 되돌릴 수 없다 — grantedAt은 지우지 않는다.
  // "언제 열렸다가 언제 닫혔나"가 남아야 나중에 물었을 때 답할 수 있다
  const done = await store.revokeCustodian(user.id, id);
  if (!done) {
    return err("NOT_FOUND", "이미 거두었거나 찾을 수 없습니다.", "목록을 새로 불러와 주세요.", 404);
  }
  return Response.json({ ok: true, data: { custodians: await store.listCustodians(user.id) } });
}
