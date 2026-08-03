// M-AUTH — POST /api/auth/{signup,login,logout} (02.4 §1)
// Supabase Auth 위임. 클라이언트는 userId를 보내지 않는다 — 쿠키가 진실이다.
import { AuthReq, SessionRes } from "@/lib/contracts";
import { AUTH_COOKIE, authClient, authEnabled, sessionCookie } from "@/lib/auth/session";

function envelopeError(
  code: string,
  message: string,
  nextAction: string,
  status: number,
) {
  return Response.json({ ok: false, error: { code, message, nextAction } }, { status });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ action: string }> },
) {
  const { action } = await ctx.params;

  if (action === "logout") {
    return Response.json(
      { ok: true, data: null },
      { headers: { "Set-Cookie": sessionCookie("", 0) } },
    );
  }

  if (action !== "signup" && action !== "login") {
    return envelopeError("NOT_FOUND", "지원하지 않는 요청입니다.", "다시 시도해 주세요.", 404);
  }

  // NFR-707 — 키 없는 환경에서는 인증이 비활성이고 화면은 DEV_USER_ID로 진행한다
  if (!authEnabled()) {
    return envelopeError(
      "AUTH_DISABLED",
      "지금은 로그인 없이 둘러보실 수 있어요.",
      "그대로 진행해 주세요.",
      503,
    );
  }

  const parsed = AuthReq.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return envelopeError(
      "INVALID_REQUEST",
      "이메일 또는 비밀번호 형식을 확인해 주세요.",
      "이메일 주소와 8자 이상의 비밀번호를 입력해 주세요.",
      400,
    );
  }

  const auth = authClient().auth;
  const { data, error } =
    action === "signup"
      ? await auth.signUp(parsed.data)
      : await auth.signInWithPassword(parsed.data);

  // **가입은 됐는데 세션이 없는 경우**가 있다 — 프로젝트에 이메일 확인이 켜져 있으면
  // signUp은 사용자를 만들고 세션은 주지 않는다. 이걸 실패로 뭉뚱그렸더니 화면에
  // "가입을 완료하지 못했습니다"가 떠서, 실제로는 만들어진 계정을 두고 사용자가
  // 몇 번이나 다시 가입을 시도했다 (2026-08-03). 사실대로 알려야 다음 행동을 할 수 있다.
  if (action === "signup" && !error && data.user && !data.session) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "EMAIL_CONFIRM_REQUIRED",
          message: "가입 확인 메일을 보냈습니다.",
          nextAction: "메일함에서 링크를 눌러 확인하신 뒤 로그인해 주세요.",
        },
      },
      { status: 202 },
    );
  }

  // 인증 실패 사유를 그대로 노출하지 않는다 (계정 존재 여부 유출 방지, NFR-705)
  if (error || !data.session || !data.user) {
    return envelopeError(
      "AUTH_FAILED",
      action === "signup"
        ? "가입을 완료하지 못했습니다."
        : "이메일 또는 비밀번호가 맞지 않습니다.",
      "입력하신 내용을 다시 확인해 주세요.",
      401,
    );
  }

  const expiresAt = new Date((data.session.expires_at ?? 0) * 1000).toISOString();
  return Response.json(
    { ok: true, data: SessionRes.parse({ userId: data.user.id, expiresAt }) },
    {
      headers: {
        "Set-Cookie": sessionCookie(
          data.session.access_token,
          data.session.expires_in ?? 3600,
        ),
      },
    },
  );
}
