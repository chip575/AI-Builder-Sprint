// 가입은 됐는데 세션이 없는 경우 — 프로젝트에 이메일 확인이 켜져 있을 때.
//
// 이걸 실패로 뭉뚱그렸더니 화면에 "가입을 완료하지 못했습니다"가 떴고, 실제로는
// 만들어진 계정을 두고 사용자가 몇 번이나 다시 가입을 시도했다 (2026-08-03).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();
vi.mock("@/lib/auth/session", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    authEnabled: () => true,
    authClient: () => ({ auth: { signUp } }),
  };
});

const { POST } = await import("./[action]/route");

function post(action: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/auth/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ action }) },
  );
}

beforeEach(() => signUp.mockReset());
afterEach(() => vi.clearAllMocks());

describe("M-AUTH — 확인 메일이 필요한 가입", () => {
  it("실패가 아니라 '확인 메일을 보냈다'고 알린다", async () => {
    signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    const res = await post("signup", { email: "a@example.com", password: "12345678" });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.error.code).toBe("EMAIL_CONFIRM_REQUIRED");
    expect(body.error.nextAction).toContain("메일함"); // 다음에 할 일이 있어야 한다
  });

  it("진짜 실패는 그대로 401이다 — 통과해야 할 것과 함께 잰다", async () => {
    signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: "x" } });
    const res = await post("signup", { email: "a@example.com", password: "12345678" });
    expect(res.status).toBe(401);
    // 사유를 그대로 노출하지 않는다 (계정 존재 여부 유출 방지, NFR-705)
    expect((await res.json()).error.message).not.toContain("x");
  });
});
