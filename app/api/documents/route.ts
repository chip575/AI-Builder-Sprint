// M-DOCUMENTS — POST /api/documents (FR-501 전 단계 · FR-103 · FR-104)
// 403 조건 둘: ① 미확정 fact 존재 ② 게이트 비통과.
// 게이트는 UI가 아니라 여기(서버)서 차단한다 — 버튼 숨김은 눈속임이다 (FR-104).
import { DocumentCreateReq, DraftRes } from "@/lib/contracts";
import { getSession } from "@/lib/ai/session/store";
import { requiredSlotsFor } from "@/lib/ai/extract/mock-extractor";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { BRANCH_PRIMARY_DOC } from "@/lib/rules/branch-doc";
import { track } from "@/lib/observability/track";
import { createDraft } from "./store";

export async function POST(req: Request) {
  const t0 = Date.now(); // NFR-709 관측 지점
  const body = await req.json().catch(() => null);
  const parsed = DocumentCreateReq.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "요청 형식이 올바르지 않습니다.",
          nextAction: "intentId를 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }

  const session = await getSession(parsed.data.intentId);
  if (!session) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "해당 대화를 찾을 수 없습니다.",
          nextAction: "대화를 먼저 시작해 주세요.",
        },
      },
      { status: 404 },
    );
  }

  const branchType = session.proposals.at(-1)?.branchType;
  if (!branchType) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "NO_BRANCH",
          message: "문서로 만들 약정 흐름이 아직 없습니다.",
          nextAction: "대화에서 원하시는 약정을 먼저 정리해 주세요.",
        },
      },
      { status: 400 },
    );
  }

  // 403 ① — 확인 버튼을 누르지 않으면 서버가 거부한다 (FR-103 수락 기준, P1 물증).
  // 필수 슬롯은 스냅숏이 아니라 현재 fact 값으로 재검증한다 (FR-102)
  const required = requiredSlotsFor(branchType);
  const missing = required.filter((key) => {
    const fact = session.facts.find((f) => f.key === key);
    return !fact || fact.value === null || fact.value === "";
  });
  const unconfirmed =
    session.facts.length === 0 || session.facts.some((f) => !f.confirmed);
  if (unconfirmed || missing.length > 0) {
    track("DRAFT", false, Date.now() - t0);
    return Response.json(
      {
        ok: false,
        error: {
          code: "FACTS_UNCONFIRMED",
          message: "아직 확인되지 않은 항목이 있습니다.",
          nextAction: "확인 화면에서 내용을 확인해 주세요.",
        },
      },
      { status: 403 },
    );
  }

  // 403 ② — 게이트 비통과. 판정은 lib/rules 순수 함수 (FR-104)
  const docType = BRANCH_PRIMARY_DOC[branchType];
  const g0 = Date.now();
  const verdict = evaluateGate(docType);
  track("GATE", true, Date.now() - g0);

  if (verdict.verdict !== "ESIGN_OK") {
    track("DRAFT", false, Date.now() - t0);
    const statuteIds = verdict.statutes.map((s) => s.id).join(", ");
    return Response.json(
      {
        ok: false,
        error: {
          code: `GATE_${verdict.verdict}`,
          message:
            verdict.verdict === "ESIGN_INVALID"
              ? `이 문서는 전자서명으로 효력이 생기지 않습니다 (${statuteIds}).`
              : "이 문서는 서명 없이 보관되는 문서입니다.",
          nextAction:
            verdict.alternativeRoute === "HANDWRITING_GUIDE"
              ? "자필 작성 안내로 이동해 주세요."
              : "보관 안내를 확인해 주세요.",
        },
      },
      { status: 403 },
    );
  }

  const draft = await createDraft(session.id, docType, verdict);
  track("DRAFT", true, Date.now() - t0);

  return Response.json({
    ok: true,
    data: DraftRes.parse({ draftId: draft.draftId, pdfUrl: draft.pdfUrl }),
  });
}
