// M-AUTH 테스트 — 키 없는 환경(채점 경로)의 동작이 핵심이다 (NFR-707).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCurrentUserId, authEnabled, loginRequired, sessionCookie } from "@/lib/auth/session";
import { DEV_USER_ID } from "@/lib/store/types";
import { POST } from "./[action]/route";

const saved = { ...process.env };

function post(action: string, body: unknown, cookie?: string) {
  return POST(
    new Request(`http://localhost/api/auth/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ action }) },
  );
}

beforeEach(() => {
  // 키 없는 환경을 강제한다 — 예선 에이전트가 실행하는 상태
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});
afterEach(() => {
  process.env = { ...saved };
});

describe("M-AUTH — 키 없는 환경 (NFR-707 채점 경로)", () => {
  it("인증 비활성 상태로 판정된다", () => {
    expect(authEnabled()).toBe(false);
  });

  it("로그인 시도 → 503 AUTH_DISABLED + 그대로 진행 안내 (벽이 되지 않는다)", async () => {
    const res = await post("login", { email: "a@example.com", password: "12345678" });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("AUTH_DISABLED");
    expect(body.error.nextAction).toContain("진행");
  });

  it("인증 비활성이면 DEV_USER_ID — 쿠키가 있어도 마찬가지 (NFR-707)", async () => {
    // 키 없는 채점 경로는 로그인 없이 전 흐름이 돌아야 한다. 여기서만 DEV_USER_ID다 —
    // 인증이 켜진 환경의 비로그인은 null이고, 그 쌍이 이 변경의 핵심이다
    expect(await getCurrentUserId(new Request("http://localhost/"))).toBe(DEV_USER_ID);
    const withCookie = new Request("http://localhost/", {
      headers: { cookie: "namgida_session=any-token" }, // 헤더 값은 ASCII만 가능
    });
    expect(await getCurrentUserId(withCookie)).toBe(DEV_USER_ID);
  });

  it("loginRequired는 401 envelope다 — 기술 코드를 노출하지 않는다 (NFR-705)", async () => {
    const res = loginRequired();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("LOGIN_REQUIRED");
    expect(body.error.nextAction).toBeTruthy();
  });
});

describe("M-AUTH — 공통", () => {
  it("로그아웃은 인증 여부와 무관하게 쿠키를 만료시킨다", async () => {
    const res = await post("logout", {});
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("모르는 action → 404", async () => {
    expect((await post("hack", {})).status).toBe(404);
  });

  it("세션 쿠키는 HttpOnly·SameSite — 스크립트가 읽지 못한다 (NFR-714)", () => {
    const c = sessionCookie("tok", 3600);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Path=/");
  });
});
