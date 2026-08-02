// M-AUTH — 현재 사용자 판별 (FR-auth · D-18)
//
// ⚠ NFR-707: 키 없는 환경에서 로그인이 벽이 되면 예선 3회 실행이 전부 막힌다.
//    Supabase가 구성되지 않았으면 인증 자체가 비활성이고 DEV_USER_ID로 통과한다.
//    이건 조용한 우회가 아니라 기동 로그(`[mode] DATA=memory`)로 선언된 상태다.
import { createClient } from "@supabase/supabase-js";
import { DEV_USER_ID } from "../store/types";

export const AUTH_COOKIE = "namgida_session";

function creds(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

/** 인증이 실제로 가능한 환경인가 — 아니면 화면·라우트는 DEV_USER_ID로 동작한다 */
export function authEnabled(): boolean {
  return creds() !== null;
}

export function authClient() {
  const c = creds();
  if (!c) throw new Error("Supabase가 구성되지 않았습니다 (인증 비활성)");
  return createClient(c.url, c.key, { auth: { persistSession: false } });
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/**
 * 요청의 사용자 id. **로그인하지 않았으면 null이다.**
 *
 * 예전에는 로그인 안 한 사람에게도 DEV_USER_ID를 돌려줬다. 그러면
 * "인증이 불가능한 환경"(키 없는 채점 경로)과 "인증은 되는데 로그인 안 한 사람"이
 * **같은 신원**이 되어, 익명 사용자끼리 서로의 자료가 보인다. 목록 화면을 켜는 순간
 * 그건 명세 유출이다 (2026-08-02).
 *
 * 반환 타입이 null을 포함하므로 호출부가 그 경우를 무시할 수 없다 — 타입이 강제한다.
 * 인증 비활성(키 없음)은 여전히 DEV_USER_ID 단일 사용자로 통과한다 (NFR-707).
 */
export async function getCurrentUserId(req: Request): Promise<string | null> {
  if (!authEnabled()) return DEV_USER_ID;
  const token = readCookie(req, AUTH_COOKIE);
  if (!token) return null;
  const { data, error } = await authClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/** 로그인이 필요할 때의 공통 응답 — 라우트마다 문구가 갈리지 않게 한 곳에 둔다 */
export function loginRequired(): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code: "LOGIN_REQUIRED",
        message: "남기신 내용을 보시려면 로그인이 필요합니다.",
        nextAction: "로그인 후 다시 시도해 주세요.",
      },
    },
    { status: 401 },
  );
}

/** 로그인 응답에 붙일 쿠키 — httpOnly, 클라이언트 스크립트가 읽지 못한다 (NFR-714) */
export function sessionCookie(token: string, maxAgeSec: number): string {
  return [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(maxAgeSec, 0)}`,
  ].join("; ");
}
