// M-DIGITAL-LEGACY — GET/POST /api/estate/digital-legacy (FR-403)
//
// 디지털 자산(구독·클라우드·SNS)을 어떻게 할지 남겨 두는 문서.
//
// ⚠ **서명하지 않는다.** 게이트가 NON_BINDING을 낸다 — 플랫폼은 우리 서류를 근거로
//   계정을 지워 주지 않는다. 이건 남은 사람이 참고할 지시이지 집행력이 있는 서류가
//   아니고, 그 사실을 화면이 분명히 말해야 한다.
// ⚠ 처리 방식이 정해지지 않은 자산은 문서에 넣지 않는다. "정해 두었다"와
//   "아직 안 정했다"를 한 목록에 섞으면 남은 사람이 무엇을 해야 할지 모른다.
// ⚠ TRANSFER는 받을 사람 없이 성립하지 않는다 (계약이 discriminatedUnion으로 강제).
//   그런데 **그 사람이 실제로 있는지**는 계약이 못 본다 — 여기서 확인한다.
import { DigitalLegacyInstructionRes } from "@/lib/contracts";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { getCurrentUserId, loginRequired } from "@/lib/auth/session";
import { store } from "@/lib/store";

function err(code: string, message: string, nextAction: string, status: number) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

/** 지시가 정해진 디지털 자산만 추린다 — 판정은 한 곳에서 한다 */
async function decidedItems(userId: string) {
  const assets = await store.listAssets(userId);
  return assets.flatMap((a) =>
    a.category === "DIGITAL" && a.disposition
      ? [{ assetId: a.id, label: a.label, disposition: a.disposition }]
      : [],
  );
}

export async function GET(req: Request) {
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();

  const items = await decidedItems(userId);
  const mine = await store.listDocumentsByUser(userId, { docType: "DIGITAL_LEGACY_INSTRUCTION" });
  const existing = mine.at(-1);

  return Response.json({
    ok: true,
    data: {
      // 아직 만들지 않았으면 null이다. 빈 문서 id를 지어내지 않는다
      documentId: existing?.draftId ?? null,
      verdict: evaluateGate("DIGITAL_LEGACY_INSTRUCTION").verdict,
      items,
      // 아직 처리 방식을 안 정한 디지털 자산 수 — 화면이 "몇 개가 남았는지"를 말할 수 있게
      undecided: (await store.listAssets(userId)).filter(
        (a) => a.category === "DIGITAL" && !a.disposition,
      ).length,
    },
  });
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();

  const items = await decidedItems(userId);
  if (items.length === 0) {
    // 빈 지시서를 만들어 두면 서랍에 뜨는데 열면 아무것도 없다 — 잃어버린 줄 안다
    return err(
      "EMPTY_DOCUMENT",
      "아직 처리 방식을 정하신 디지털 자산이 없습니다.",
      "자산 목록에서 계정이나 구독의 처리 방식을 하나 이상 정해 주세요.",
      409,
    );
  }

  // TRANSFER는 받을 사람이 실제로 있어야 한다. 계약은 "id가 있다"까지만 보고
  // **그 사람이 존재하는지**는 못 본다 — 없는 사람에게 넘기라는 지시가 남으면
  // 남은 사람은 그 줄에서 멈춘다
  const known = new Set((await store.listBeneficiaries(userId)).map((b) => b.id));
  const orphan = items.find(
    (i) => i.disposition.action === "TRANSFER" && !known.has(i.disposition.toBeneficiaryId),
  );
  if (orphan) {
    return err(
      "UNKNOWN_BENEFICIARY",
      `‘${orphan.label}’을(를) 넘겨받으실 분을 찾을 수 없습니다.`,
      "받으실 분을 먼저 등록하시거나 처리 방식을 다시 골라 주세요.",
      404,
    );
  }

  // 여러 번 눌러도 서랍에 같은 문서가 쌓이지 않는다. 내용은 자산에서 매번 다시 읽으므로
  // 문서를 새로 만들 이유가 없다 — 문서는 "서랍의 자리"이고 본문은 자산이 갖는다
  const mine = await store.listDocumentsByUser(userId, { docType: "DIGITAL_LEGACY_INSTRUCTION" });
  const existing = mine.at(-1);
  if (existing) {
    return Response.json({
      ok: true,
      data: DigitalLegacyInstructionRes.parse({
        documentId: existing.draftId,
        verdict: existing.verdict.verdict,
        items,
      }),
    });
  }

  // 자산은 intent에 매이지 않는다 — 이 사람의 기존 세션을 재사용하고, 없을 때만 만든다
  // (draft는 소유자를 intents로만 알기 때문이다)
  const anyDraft = (await store.listDocumentsByUser(userId)).at(-1);
  const intentId =
    anyDraft?.intentId ?? (await store.getOrCreateSession(null, userId)).id;
  const verdict = evaluateGate("DIGITAL_LEGACY_INSTRUCTION");
  const draft = await store.createDraft(intentId, "DIGITAL_LEGACY_INSTRUCTION", verdict);

  return Response.json({
    ok: true,
    data: DigitalLegacyInstructionRes.parse({
      documentId: draft.draftId,
      verdict: verdict.verdict,
      items,
    }),
  });
}
