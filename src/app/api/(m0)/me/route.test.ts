// M-PROFILE — 마이페이지 값이 서식으로 흘러가는 경로 (FR-501 · NFR-714)
//
// 이 값들은 계약서에 인쇄된다. 그래서 "비었을 때 무엇이 들어가는가"가 핵심 검사다 —
// 빈칸으로 서명되면 되돌릴 수 없고, 없는 번호를 지어내면 계약서가 거짓이 된다.
import { describe, expect, it } from "vitest";
import { store } from "@/lib/store";
import { effectiveProfile } from "./route";
import { GET, PATCH } from "./route";

const patch = (body: unknown) =>
  PATCH(
    new Request("http://localhost/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("🔴 비었을 때 서식에 들어갈 값", () => {
  it("성명이 없으면 이메일 앞부분을 쓴다 — 빈칸으로 서명되지 않게", () => {
    const eff = effectiveProfile("kim@example.com", undefined);
    expect(eff.displayName).toBe("kim");
  });

  it("연락처가 없으면 이메일을 쓴다 — 없는 번호를 지어내지 않는다", () => {
    // 임의의 010-0000-0000을 넣으면 계약서에 존재하지 않는 번호가 인쇄된다.
    // 이메일은 실재하는 연락 수단이라 거짓이 아니다
    const eff = effectiveProfile("kim@example.com", undefined);
    expect(eff.contact).toBe("kim@example.com");
    expect(eff.contact).not.toMatch(/010-?0000/);
  });

  it("저장한 값이 있으면 그것을 쓴다", () => {
    const eff = effectiveProfile("kim@example.com", {
      displayName: "김가상",
      contact: "010-1234-5678",
      orgName: "부산 지역아동센터",
    });
    expect(eff.displayName).toBe("김가상");
    expect(eff.contact).toBe("010-1234-5678");
    expect(eff.orgName).toBe("부산 지역아동센터");
  });

  it("기관명은 없어도 대체하지 않는다 — 존재하지 않는 기관을 인쇄할 수 없다", () => {
    const eff = effectiveProfile("kim@example.com", undefined);
    expect(eff.orgName).toBeNull();
  });
});

describe("M-PROFILE — 저장", () => {
  it("빈 문자열은 지움으로 읽는다 — 안 건드린 것과 구분한다", async () => {
    const res = await patch({ displayName: "김가상", contact: "  " });
    const { data } = await res.json();
    expect(data.displayName).toBe("김가상");
    expect(data.contact).toBeNull(); // 공백만 보내면 지운 것
  });

  it("보내지 않은 항목은 그대로 둔다", async () => {
    await patch({ displayName: "김가상", orgName: "부산 지역아동센터" });
    const { data } = await (await patch({ displayName: "이가상" })).json();
    expect(data.displayName).toBe("이가상");
    expect(data.orgName).toBe("부산 지역아동센터"); // 안 보냈으니 유지
  });

  it("저장값을 그대로 돌려준다 — 대체값을 섞지 않는다", async () => {
    // 대체값을 응답에 섞으면 사용자는 자기가 입력한 줄로 안다
    await patch({ displayName: null, contact: null });
    const { data } = await (await GET(new Request("http://localhost/api/me"))).json();
    expect(data.displayName).toBeNull();
    expect(data.contact).toBeNull();
  });
});

describe("M-PROFILE — 저장소", () => {
  it("부분 수정이 다른 항목을 지우지 않는다", async () => {
    const u = "33333333-3333-4333-8333-333333333333";
    await store.saveProfile(u, { displayName: "김가상", contact: "010-1111-2222" });
    const after = await store.saveProfile(u, { orgName: "부산 지역아동센터" });
    expect(after.displayName).toBe("김가상");
    expect(after.contact).toBe("010-1111-2222");
    expect(after.orgName).toBe("부산 지역아동센터");
  });
});
