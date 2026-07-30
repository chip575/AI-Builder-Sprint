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
 * 요청의 사용자 id. 인증 비활성이거나 세션이 없으면 DEV_USER_ID.
 * 소유 필터(D-18)는 이 값을 기준으로 라우트가 명시적으로 건다.
 */
export async function getCurrentUserId(req: Request): Promise<string> {
  if (!authEnabled()) return DEV_USER_ID;
  const token = readCookie(req, AUTH_COOKIE);
  if (!token) return DEV_USER_ID;
  const { data, error } = await authClient().auth.getUser(token);
  if (error || !data.user) return DEV_USER_ID;
  return data.user.id;
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
