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
