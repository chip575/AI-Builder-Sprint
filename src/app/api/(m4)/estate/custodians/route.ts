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
import {
  CustodianInviteReq,
  CustodianInviteRes,
  CustodianScopePatch,
  CustodianScopePatchRes,
  type AssetCategory,
  type Custodian,
} from "@/lib/contracts";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { getCurrentUser, loginRequired } from "@/lib/auth/session";
import { signer } from "@/lib/signer";
import { store } from "@/lib/store";

/** 범위를 사람 말로 — 코드값이 약정서에 인쇄되면 무엇을 허락한 것인지 모른다 */
const SCOPE_LABEL: Record<string, string> = {
  REAL_ESTATE: "부동산", FINANCIAL: "금융", INSURANCE: "보험", SECURITIES: "증권",
  DEBT: "채무", BELONGINGS: "물건", DIGITAL: "디지털",
};
const scopeLabel = (s: string) => SCOPE_LABEL[s] ?? s;

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

  const sent = await inviteWithAgreement(user, to, parsed.data.displayName, parsed.data.viewScope);
  if (!sent.sent) return sent.error;

  return Response.json({
    ok: true,
    data: CustodianInviteRes.parse({ custodian: sent.custodian, draftId: sent.draftId }),
  });
}

/** 협조 약정서를 만들어 지킴이에게 보낸다. 초대와 범위 변경이 **같은 일**을 한다 —
 *  둘 다 새 약정서에 서명을 받아야 권한이 열린다 (NFR-713) */
async function inviteWithAgreement(
  user: { id: string; email: string },
  to: { id: string; name: string; email: string },
  displayName: string,
  viewScope: AssetCategory[],
): Promise<
  | { sent: false; error: Response }
  | { sent: true; custodian: Custodian; draftId: string }
> {
  // 협조 약정서는 서명 대상이다 (게이트 ESIGN_OK). 서명이 곧 초대 수락이다
  const verdict = evaluateGate("CUSTODIAN_AGREEMENT");
  // ⚠ draft는 intent(세션)에 매달린다 — 소유자를 아는 곳이 intents뿐이기 때문이다.
  //   초대마다 새로 만들면 발화 0건짜리 고아 세션이 쌓이므로, 이 사람의 기존 세션을
  //   재사용한다. 없을 때만 하나 만든다.
  const existingDraft = (await store.listDocumentsByUser(user.id)).at(-1);
  const intentId =
    existingDraft?.intentId ?? (await store.getOrCreateSession(null, user.id)).id;
  const draft = await store.createDraft(intentId, "CUSTODIAN_AGREEMENT", verdict);

  const custodian = await store.upsertCustodian(user.id, {
    recipientId: to.id,
    displayName,
    viewScope,
    agreementDraftId: draft.draftId,
  });

  try {
    const result = await signer.requestWithTemplate({
      templateKey: "CUSTODIAN_AGREEMENT",
      draftId: draft.draftId,
      // 서명자는 **지킴이 본인**이다 (TEMPLATE_ROLES.CUSTODIAN = ["지킴이"]).
      // 본인이 서명하는 서식이 아니라 상대가 수락하는 서식이다
      signerName: displayName,
      signerEmail: to.email,
      fields: {
        custodian_name: displayName,
        // 범위를 사람 말로 적는다 — 코드값이 약정서에 인쇄되면 무엇을 허락한 것인지 모른다
        view_scope: viewScope.length > 0 ? viewScope.map(scopeLabel).join(", ") : "지정된 범위 없음",
        duties: "남기신 뜻과 자산 목록을 정해진 범위에서 열람하고, 필요한 절차에 협조합니다.",
      },
    });
    await store.markDraftRequested(draft.draftId, result.documentId);
  } catch (e) {
    // 조용히 성공으로 넘기지 않는다 (보안 7조) — 안 갔는데 갔다고 하면
    // 사용자는 지킴이가 초대를 받은 줄 안다
    console.warn("[custodian] 초대 발송 실패:", (e as Error).message);
    return {
      sent: false as const,
      error: err(
        "SIGN_REQUEST_FAILED",
        "초대를 보내지 못했습니다.",
        "잠시 뒤 다시 시도해 주세요. 열람 권한은 아직 열리지 않았습니다.",
        502,
      ),
    };
  }

  return { sent: true as const, custodian, draftId: draft.draftId };
}

/**
 * 열람 범위 변경 (NFR-713 · CustodianScopePatch).
 *
 * ⚠ 범위를 바꾸면 **약정서 본문이 바뀐다.** 그래서 조용히 갱신하지 않고
 *   MATERIAL로 보아 재서명을 받는다 — 지킴이가 "무엇을 볼 수 있는지" 모른 채
 *   범위가 넓어지면, 그가 동의한 적 없는 권한을 갖게 된다.
 * ⚠ 그래서 status는 PENDING으로 돌아가고 **그 사이 열람은 닫힌다.**
 *   좁히는 경우에도 마찬가지다: 좁히는 것도 본문 변경이고, 새 약정서가 정본이다.
 */
export async function PATCH(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return loginRequired();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return err("INVALID_REQUEST", "어느 분의 범위인지 알 수 없습니다.", "다시 시도해 주세요.", 400);

  const parsed = CustodianScopePatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return err("INVALID_REQUEST", "열람 범위를 저장하지 못했습니다.", "범위를 다시 골라 주세요.", 400);
  }

  const mine = await store.listCustodians(user.id);
  const current = mine.find((c) => c.id === id);
  if (!current) {
    return err("NOT_FOUND", "그 분을 찾을 수 없습니다.", "목록을 새로 불러와 주세요.", 404);
  }
  if (current.status === "REVOKED") {
    // 거둔 권한을 범위 변경으로 되살리지 않는다 — 다시 맡기시려면 새로 초대해야 한다
    return err(
      "ALREADY_REVOKED",
      "이미 권한을 거두신 분입니다.",
      "다시 맡기시려면 새로 부탁드려 주세요.",
      409,
    );
  }

  const people = await store.listRecipients(user.id, "CUSTODIAN");
  const to = people.find((r) => r.id === current.recipientId);
  if (!to) {
    return err("NOT_FOUND", "그 분의 연락처를 찾을 수 없습니다.", "‘알릴 분’에서 확인해 주세요.", 404);
  }

  const sent = await inviteWithAgreement(user, to, current.displayName, parsed.data.viewScope);
  if (!sent.sent) return sent.error;

  return Response.json({
    ok: true,
    data: CustodianScopePatchRes.parse({
      custodian: sent.custodian,
      // 범위 변경은 언제나 재서명이다 (NFR-713). "이번은 사소하다"는 판단을
      // 여기서 하지 않는다 — 사소한지 아는 것은 지킴이지 우리가 아니다
      requiresResign: true,
      // 원장 노드는 붙이지 않는다. Intent Ledger의 subject는 intent인데 지킴이 권한은
      // 특정 대화에 매이지 않는다 — 억지로 매달면 "어느 대화의 이력인가"가 거짓이 된다.
      // 권한 이력은 custodians의 granted_at·revoked_at과 audit_logs가 갖는다
      ledgerNodeId: null,
    }),
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
