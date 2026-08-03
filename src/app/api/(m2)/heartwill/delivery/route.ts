// M-HEARTWILL-DELIVERY — GET/PATCH /api/heartwill/delivery (FR-112)
//
// "언제, 누구에게 전할지"를 남겨 둔다. **이 서비스가 하는 일이 그것이다** — 뜻을 기록하는 것.
//
// ⚠ 보관과 발송은 다른 층이다. 여기 값이 있다고 전달이 일어나지 않는다.
//   정책마다 준비 상태가 다르고, 그 사실을 **응답이 함께 말한다**(`ready`) —
//   화면이 짐작하게 두면 언젠가 "설정했는데 왜 안 갔죠"가 된다.
//     · SCHEDULED  — 약속(obligations)·크론이 이미 있다
//     · IMMEDIATE  — 유가족 통지 경로가 아직 없다
//     · POSTHUMOUS — 사망 확인 절차가 설계되지 않았다
//
// ⚠ 받는 분은 주소록(recipients)에 있어야 한다. 여기서 이메일을 직접 받지 않는다 —
//   받으면 같은 사람이 여러 곳에 다른 주소로 쌓인다.
import { DeliveryPatch } from "@/lib/contracts";
import { getCurrentUserId, loginRequired } from "@/lib/auth/session";
import { store } from "@/lib/store";

/** 이 정책으로 실제 전달이 일어날 수 있는가. 화면이 짐작하지 않게 서버가 말한다 */
const READY: Record<string, { ready: boolean; note: string }> = {
  SCHEDULED: { ready: true, note: "정하신 날짜에 전해 드립니다." },
  IMMEDIATE: {
    ready: false,
    note: "지금 바로 전하는 기능은 아직 준비 중입니다. 정해 두신 내용은 그대로 남습니다.",
  },
  POSTHUMOUS: {
    ready: false,
    note: "떠나신 뒤에 전하는 절차는 아직 준비 중입니다. 정해 두신 내용은 그대로 남습니다.",
  },
};

function err(code: string, message: string, nextAction: string, status: number) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

/** 세션이 내 것인지 — 남의 대화의 전달 설정을 보거나 바꾸지 못하게 */
async function mySession(userId: string, sessionId: string | null) {
  if (!sessionId) return null;
  const s = await store.getSession(sessionId);
  return s && s.userId === userId ? s : null;
}

export async function GET(req: Request) {
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();

  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!(await mySession(userId, sessionId))) {
    return err("NOT_FOUND", "해당 기록을 찾을 수 없습니다.", "마음 유언 화면에서 다시 들어와 주세요.", 404);
  }

  const delivery = await store.getHeartWillDelivery(sessionId!);
  if (!delivery) {
    return err(
      "EMPTY_DOCUMENT",
      "아직 남기기로 하신 문단이 없습니다.",
      "문단을 하나 이상 승인하시면 전달 설정을 정하실 수 있습니다.",
      409,
    );
  }
  return Response.json({
    ok: true,
    data: { ...delivery, ...READY[delivery.revealPolicy]! },
  });
}

export async function PATCH(req: Request) {
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();

  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!(await mySession(userId, sessionId))) {
    return err("NOT_FOUND", "해당 기록을 찾을 수 없습니다.", "마음 유언 화면에서 다시 들어와 주세요.", 404);
  }

  const parsed = DeliveryPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return err("INVALID_REQUEST", "전달 설정을 저장하지 못했습니다.", "언제 전할지 다시 골라 주세요.", 400);
  }
  // 예약인데 날짜가 없으면 "언제"가 비어 있다 — 계약은 nullish라 여기서 막는다
  if (parsed.data.revealPolicy === "SCHEDULED" && !parsed.data.revealAt) {
    return err("REVEAL_AT_REQUIRED", "언제 전할지 날짜를 정해 주세요.", "날짜를 고르시면 저장합니다.", 400);
  }

  // 받는 분은 주소록에 있어야 한다 — 없는 사람에게 전하라는 설정이 남으면
  // 나중에 그 줄에서 멈춘다
  const known = new Set((await store.listRecipients(userId)).map((r) => r.id));
  const unknown = parsed.data.recipientIds.find((id) => !known.has(id));
  if (unknown) {
    return err("NOT_FOUND", "받으실 분을 찾을 수 없습니다.", "‘내 정보 → 알릴 분’에서 먼저 등록해 주세요.", 404);
  }

  const saved = await store.saveHeartWillDelivery(sessionId!, {
    revealPolicy: parsed.data.revealPolicy,
    revealAt: parsed.data.revealAt ?? null,
    recipientIds: parsed.data.recipientIds,
  });
  if (!saved) {
    return err(
      "EMPTY_DOCUMENT",
      "아직 남기기로 하신 문단이 없습니다.",
      "문단을 하나 이상 승인하시면 전달 설정을 정하실 수 있습니다.",
      409,
    );
  }
  return Response.json({
    ok: true,
    data: { ...saved, ...READY[saved.revealPolicy]! },
  });
}
