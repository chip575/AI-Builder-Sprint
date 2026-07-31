// M-FAMILY-ACK — POST /api/family-ack (FR-554)
//
// 가족의 서명은 **동의가 아니라 인지**다. 이 라우트가 만드는 것은 승인 요청이 아니라
// "이런 변경이 있었음을 알린 기록"이다. 가족이 거부해도 본인 확인서는 그대로다 —
// 가족이 거부하면 뜻이 흔들리는 구조였다면, 그건 본인의 뜻이 아니라 가족의 뜻을
// 기록하는 시스템이다.
//
// 응답은 별도 API로 받지 않는다. 서명 웹훅이 채운다 —
// `document_all_signed → ACKNOWLEDGED`, `document_rejected → DECLINED`.
// 버튼 클릭으로 받으면 "인지했다"는 주장에 **서명이라는 근거가 없어진다**.
import { FamilyAckReq, FamilyAckRes } from "@/lib/contracts";
import { signer } from "@/lib/signer";
import { store } from "@/lib/store";

function bad(code: string, message: string, nextAction: string, status: number) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

export async function POST(req: Request) {
  const parsed = FamilyAckReq.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return bad(
      "INVALID_REQUEST",
      "요청 형식이 올바르지 않습니다.",
      "알릴 분을 다시 선택해 주세요.",
      400,
    );
  }
  const { ledgerNodeId, recipientIds } = parsed.data;

  const node = await store.getLedgerNode(ledgerNodeId);
  if (!node) {
    return bad(
      "NOT_FOUND",
      "해당 이력을 찾을 수 없습니다.",
      "이력 화면에서 다시 시도해 주세요.",
      404,
    );
  }

  // 순차 보장 — 본인 확인서가 아직이면 가족에게 알리지 않는다.
  // 본인이 서명하지 않은 변경을 가족이 먼저 아는 순서는 뒤집힌 순서다.
  if (node.materiality === "MATERIAL" && !node.draftId) {
    return bad(
      "SELF_SIGN_REQUIRED",
      "본인 확인이 끝난 뒤에 알릴 수 있습니다.",
      "먼저 본인 확인서에 서명해 주세요.",
      409,
    );
  }

  // 빈 배열은 정상이다. 알리지 않을 자유가 본인에게 있다 (P4).
  // 여기서 "최소 1명"을 요구하면 통지가 사실상 강제된다.
  const targets = [];
  for (const recipientId of recipientIds) {
    let documentId = null;
    try {
      const r = await signer.requestWithTemplate({
        draftId: ledgerNodeId,
        templateKey: "FAMILY_ACK",
        signerName: "가족",
        signerEmail: "family@example.invalid",
      });
      documentId = r.documentId;
    } catch (err) {
      // 서식 미등록을 조용히 넘기지 않는다 (보안 7조). 무엇을 설정해야 하는지 알린다
      return bad(
        "TEMPLATE_NOT_READY",
        "가족 인지 서식이 아직 준비되지 않았습니다.",
        (err as Error).message.includes("템플릿")
          ? "MODUSIGN_TEMPLATE_FAMILY_ACK를 설정한 뒤 다시 시도해 주세요."
          : "잠시 후 다시 시도해 주세요.",
        503,
      );
    }
    targets.push({ recipientId, documentId });
  }

  const acks = await store.requestFamilyAcks(ledgerNodeId, targets);

  return Response.json({
    ok: true,
    data: FamilyAckRes.parse({
      requested: acks.length,
      acks: acks.map((a) => ({
        recipientId: a.recipientId,
        status: a.status,
        respondedAt: a.signedAt,
      })),
    }),
  });
}

/** 인지 현황 조회 — 타임라인 화면이 노드별로 부른다 */
export async function GET(req: Request) {
  const ledgerNodeId = new URL(req.url).searchParams.get("ledgerNodeId");
  if (!ledgerNodeId) {
    return bad(
      "INVALID_REQUEST",
      "조회할 이력을 지정해 주세요.",
      "이력 화면에서 다시 시도해 주세요.",
      400,
    );
  }
  const acks = await store.listFamilyAcks(ledgerNodeId);
  return Response.json({
    ok: true,
    data: FamilyAckRes.parse({
      requested: acks.length,
      acks: acks.map((a) => ({
        recipientId: a.recipientId,
        status: a.status,
        respondedAt: a.signedAt,
      })),
    }),
  });
}
