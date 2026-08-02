// M-HEARTWILL-DOC — POST /api/heartwill/document (FR-111 · FR-112)
//
// 마음 유언을 **서류로 굳힌다.** 지금까지 이 경로가 없었다:
//   HEART_LETTER가 DocType에도 게이트에도 CLM 라벨에도 준비돼 있는데
//   그것을 만드는 코드가 어디에도 없었다.
//
// 왜 POST /api/documents를 못 쓰나: 그쪽은 `branchType`을 받아 BRANCH_PRIMARY_DOC로
// 서류를 정한다. 마음 유언은 **가지가 아니라 축(회상)에서** 나오므로 그 표에 자리가
// 없다. 가지 표에 억지로 끼우면 "마음 유언 가지"라는 없는 개념이 생긴다.
//
// ⚠ 서명하지 않는다. 게이트가 NON_BINDING을 내고, 그 판정이 곧 이 문서의 성격이다 —
//   법적 효력이 있는 서류가 아니라 마음을 남겨 두는 기록이다.
// ⚠ 승인된 문단만 문서가 된다 (P1). 미승인 초안은 본문이 아니다.
import { evaluateGate } from "@/lib/rules/validity-gate";
import { getCurrentUserId, loginRequired } from "@/lib/auth/session";
import { store } from "@/lib/store";
import { z } from "zod";

const Req = z.object({ sessionId: z.string().uuid() });

function err(code: string, message: string, nextAction: string, status: number) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();

  const parsed = Req.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return err("INVALID_REQUEST", "어느 대화의 기록인지 알 수 없습니다.", "다시 시도해 주세요.", 400);
  }
  const { sessionId } = parsed.data;

  // 소유 확인 — 남의 세션으로 문서를 만들면 그 사람의 이야기가 내 서랍에 들어온다
  const session = await store.getSession(sessionId);
  if (!session || session.userId !== userId) {
    return err("NOT_FOUND", "해당 기록을 찾을 수 없습니다.", "대화 화면에서 다시 들어와 주세요.", 404);
  }

  const head = await store.getHeartWillHead(sessionId);
  const body = (head?.paragraphs ?? []).filter((p) => p.acceptedAt !== null);
  if (body.length === 0) {
    // 승인이 하나도 없으면 문서가 아니다. 빈 문서를 만들어 두면 CLM에 "마음 편지"가
    // 뜨는데 열면 아무것도 없다 — 사용자는 잃어버린 줄 안다
    return err(
      "EMPTY_DOCUMENT",
      "아직 남기기로 하신 문단이 없습니다.",
      "마음 유언 화면에서 문단을 하나 이상 승인해 주세요.",
      409,
    );
  }

  // 이미 만든 것이 있으면 새로 만들지 않는다 — 누를 때마다 서랍에 같은 문서가 쌓인다.
  // 갱신은 문단 승인(applyHeartWill)이 하고, 이 라우트는 서랍에 넣는 일만 한다
  const mine = await store.listDocumentsByUser(userId, { docType: "HEART_LETTER" });
  const existing = mine.find((d) => d.intentId === sessionId);
  if (existing) {
    return Response.json({
      ok: true,
      data: { draftId: existing.draftId, paragraphs: body.length, created: false },
    });
  }

  // 게이트가 NON_BINDING을 낸다. 이 값이 화면의 서명 버튼 유무를 정한다 (FR-104)
  const verdict = evaluateGate("HEART_LETTER");
  const draft = await store.createDraft(sessionId, "HEART_LETTER", verdict);

  return Response.json({
    ok: true,
    data: { draftId: draft.draftId, paragraphs: body.length, created: true },
  });
}
