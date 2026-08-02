// M-RECIPIENT — GET/POST/DELETE /api/recipients (FR-405 · FR-112 · NFR-714)
//
// 알릴 상대를 모아 두는 곳. 기관(수증처)·유가족·지킴이가 한 목록이다 —
// 역할은 다르지만 우리가 쓰는 방식은 같다(이름·이메일로 무언가를 보낸다).
//
// ⚠ 이메일은 개인정보다 (보안 1조).
//   · 에러 메시지에 입력값을 되돌려 싣지 않는다 — 그 순간 로그로 샌다
//   · 목록 응답에는 원문을 담는다. 화면이 목록에서는 마스킹하고 **발송 확인 화면에서만**
//     전체를 보여주기 때문이다. 전부 가리면 사용자가 오타를 못 잡는데, 통지서에는
//     이름과 약정 내용이 실려서 틀린 주소로 가는 순간 그게 곧 유출이다.
import { RecipientKind, RecipientListRes, RecipientUpsertReq } from "@/lib/contracts";
import { getCurrentUserId, loginRequired } from "@/lib/auth/session";
import { store } from "@/lib/store";

function err(code: string, message: string, nextAction: string, status: number) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

async function list(userId: string, kind?: RecipientKind) {
  return Response.json({
    ok: true,
    data: RecipientListRes.parse({ recipients: await store.listRecipients(userId, kind) }),
  });
}

export async function GET(req: Request) {
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();

  // ?kind=ORG — 철회 통지 화면은 기관만 필요하다. 거르는 일을 화면에 맡기면
  // 화면마다 다르게 거르고, 언젠가 한 곳이 유가족까지 보여준다
  const raw = new URL(req.url).searchParams.get("kind");
  const kind = raw ? RecipientKind.safeParse(raw) : null;
  if (raw && !kind!.success) {
    return err("INVALID_REQUEST", "찾으시는 분류를 알 수 없습니다.", "다시 시도해 주세요.", 400);
  }
  return list(userId, kind?.success ? kind.data : undefined);
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();

  const parsed = RecipientUpsertReq.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // ⚠ 어떤 값이 틀렸는지는 알리되 **입력한 값 자체를 되싣지 않는다** (보안 1조)
    const bad = parsed.error.issues[0]?.path.join(".") ?? "";
    return err(
      "INVALID_REQUEST",
      "입력하신 내용을 저장하지 못했습니다.",
      bad === "email"
        ? "이메일 주소 형식을 확인해 주세요."
        : "이름과 이메일을 확인해 주세요.",
      400,
    );
  }

  await store.upsertRecipient(userId, parsed.data);
  // 등록 응답도 목록 한 벌 — 화면이 자기 상태를 따로 이어 붙이지 않게 한다 (인벤토리와 같은 규약)
  return list(userId);
}

export async function DELETE(req: Request) {
  const userId = await getCurrentUserId(req);
  if (!userId) return loginRequired();

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return err("INVALID_REQUEST", "지울 대상을 찾지 못했습니다.", "다시 시도해 주세요.", 400);

  // 소유자 확인은 저장소가 한다 — 남의 id를 넣어도 false가 돌아온다.
  // 없는 것과 남의 것을 **같은 응답으로** 돌려준다: 구분해 주면 남의 id를 탐색할 수 있다
  const removed = await store.deleteRecipient(userId, id);
  if (!removed) {
    return err("NOT_FOUND", "이미 지워졌거나 찾을 수 없습니다.", "목록을 새로 불러와 주세요.", 404);
  }
  return list(userId);
}
