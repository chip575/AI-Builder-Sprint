// M-LEDGER-NOTIFY — POST /api/ledger/[subjectId]/notify (FR-405 · 민법 §1108①)
//
// 철회를 기관에 알린다. **철회와 별개 단계다** — 상대에게 무언가를 보내는 일은
// 사용자가 한 번 더 눌러야 한다 (서명 요청과 같은 규약).
//
// 왜 메일이 아니라 서명 요청인가: 그냥 보내면 "보냈다"만 남고 "받았다"는 안 남는다.
// 기관이 서명하면 그게 **도달 증거**가 되고, 웹훅이 증빙·해시까지 만들어 준다.
// 별도 메일 인프라도 필요 없다.
//
// ⚠ 기관이 서명하지 않아도 철회는 성립한다 (서식 제2조). 그래서 이 문서가 미완료로
//   남는 것은 결함이 아니다 — 화면이 그렇게 말해야 한다.
import { canRevoke } from "@/lib/rules/revocation";
import { docLabel } from "@/lib/docs/labels";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { effectiveProfile } from "@/app/api/(m0)/me/route";
import { getCurrentUser, loginRequired } from "@/lib/auth/session";
import { signer } from "@/lib/signer";
import { store } from "@/lib/store";
import { z } from "zod";

const NotifyReq = z.object({ recipientId: z.string().uuid() });

function err(code: string, message: string, nextAction: string, status: number) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ subjectId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) return loginRequired();
  const { subjectId } = await ctx.params;

  const parsed = NotifyReq.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return err("INVALID_REQUEST", "받으실 곳을 찾지 못했습니다.", "목록에서 골라 주세요.", 400);
  }

  // 소유 확인 — 남의 약정에 대해 통지를 보내면 그 사람의 기관에 우리 이름으로 메일이 간다.
  // ⚠ subjectId는 intentId다 (revoke 라우트 주석 참조)
  const session = await store.getSession(subjectId);
  if (!session || session.userId !== user.id) {
    return err("NOT_FOUND", "해당 약정을 찾을 수 없습니다.", "목록에서 다시 골라 주세요.", 404);
  }
  const origin = (await store.listDocumentsByUser(user.id))
    .filter((d) => d.intentId === subjectId && d.docType !== "INTENT_AFFIRMATION")
    .at(-1);
  if (!origin) {
    return err("NOT_FOUND", "해당 약정을 찾을 수 없습니다.", "목록에서 다시 골라 주세요.", 404);
  }
  if (!canRevoke(origin.docType)) {
    return err("NOT_REVOCABLE", "이 서류는 철회 통지 대상이 아닙니다.", "목록을 확인해 주세요.", 409);
  }

  // 철회부터 되어 있어야 한다. 통지가 먼저 나가면 "철회했다"가 거짓이 된다
  const nodes = await store.listLedgerNodes(subjectId);
  if (nodes.length === 0 || nodes.some((n) => n.status !== "REVOKED")) {
    return err(
      "NOT_REVOKED",
      "아직 철회하지 않으신 약정입니다.",
      "먼저 철회하신 뒤에 알려 드릴 수 있습니다.",
      409,
    );
  }

  const recipients = await store.listRecipients(user.id, "ORG");
  const to = recipients.find((r) => r.id === parsed.data.recipientId);
  if (!to) {
    // 없는 것과 남의 것을 같은 응답으로 — 구분해 주면 남의 id를 탐색할 수 있다
    return err("NOT_FOUND", "받으실 곳을 찾을 수 없습니다.", "‘알릴 분’에서 먼저 등록해 주세요.", 404);
  }

  // 통지서는 **새 문서다.** 원 약정 문서를 고치지 않는다 — 서명된 것은 그대로 둔다 (P5)
  const verdict = evaluateGate("REVOCATION_NOTICE");
  const notice = await store.createDraft(subjectId, "REVOCATION_NOTICE", verdict);

  const profile = await store.getProfile(user.id);
  const eff = effectiveProfile(user.email, profile);
  // 철회 사유·시점은 원장에서 읽는다. 화면이 다시 보내게 하면 문서와 이력이 갈라진다
  const revokeNode = [...nodes].sort((a, b) => b.seq - a.seq)[0]!;

  try {
    const result = await signer.requestWithTemplate({
      templateKey: "REVOCATION_NOTICE",
      draftId: notice.draftId,
      signerName: eff.displayName,
      signerEmail: user.email,
      // 기관이 2순위 서명자다 (수령 확인). 서명하지 않아도 철회는 성립한다
      counterparty: { name: to.name, email: to.email },
      fields: {
        revoker_name: eff.displayName,
        revoker_contact: eff.contact,
        org_name: to.name,
        // 코드값이 아니라 사람이 읽는 이름을 싣는다 — 화면에서 "유산 기부 약정서"로
        // 보던 것을 서면에서 LEGACY_GIFT_AGREEMENT로 만나면 같은 것인 줄 모른다
        original_agreement: `${docLabel(origin.docType)} · ${origin.createdAt.slice(0, 10)} 체결`,
        revocation_reason: revokeNode.changeReason,
        // 서명일이 아니라 **의사표시일**이다 — 기관이 사흘 뒤 서명해도 철회일은 그날이다
        revocation_date: revokeNode.createdAt.slice(0, 10),
      },
    });
    await store.markDraftRequested(notice.draftId, result.documentId);
  } catch (e) {
    // 조용히 성공으로 넘기지 않는다 (보안 7조) — 안 갔는데 갔다고 하면 사용자가
    // 기관이 안다고 믿는다
    console.warn("[notify] 통지 발송 실패:", (e as Error).message);
    return err(
      "SIGN_REQUEST_FAILED",
      "통지를 보내지 못했습니다.",
      "철회는 이미 되었습니다. 잠시 뒤 다시 시도해 주세요.",
      502,
    );
  }

  await store.recordAudit("revocation.notify", subjectId, { docType: origin.docType }).catch(() => {});

  return Response.json({
    ok: true,
    data: {
      noticeDraftId: notice.draftId,
      // 기관 이름은 돌려주되 이메일은 안 돌려준다 — 화면은 이미 알고 있다 (보안 1조)
      orgName: to.name,
    },
  });
}
