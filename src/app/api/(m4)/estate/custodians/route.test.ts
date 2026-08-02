// M-CUSTODIAN — 지킴이 (FR-405 · NFR-713)
//
// 이 권한은 **남의 재산 목록을 보는 권한**이다. 그래서 검사의 무게중심이
// "열리나"가 아니라 **"언제 열리나 / 언제 안 열리나"** 에 있다.
import { describe, expect, it } from "vitest";
import { DEV_USER_ID } from "@/lib/store/types";
import { store } from "@/lib/store";
import { DELETE, GET, POST } from "./route";

const invite = (body: unknown) =>
  POST(
    new Request("http://localhost/api/estate/custodians", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

async function person(email: string, userId = DEV_USER_ID) {
  return store.upsertRecipient(userId, { kind: "CUSTODIAN", name: "이가상", email, relation: "조카" });
}

describe("초대", () => {
  it("초대해도 열람은 아직 열리지 않는다 (PENDING = 열람 0건)", async () => {
    const p = await person("cu1@example.org");
    const { ok, data } = await (
      await invite({ recipientId: p.id, displayName: "이가상", viewScope: ["FINANCIAL"] })
    ).json();

    expect(ok).toBe(true);
    expect(data.custodian.status).toBe("PENDING");
    // 🔴 grantedAt이 열람의 기준이다 — 초대만으로 차면 안 된다
    expect(data.custodian.grantedAt).toBeNull();
  });

  it("서명이 끝나야 열린다", async () => {
    const p = await person("cu2@example.org");
    const { data } = await (
      await invite({ recipientId: p.id, displayName: "이가상", viewScope: ["FINANCIAL"] })
    ).json();

    const granted = await store.grantCustodian(data.draftId);
    expect(granted?.status).toBe("ACTIVE");
    expect(granted?.grantedAt).not.toBeNull();
  });

  it("주소록에 없는 사람은 초대할 수 없다 — 여기서 이메일을 직접 받지 않는다", async () => {
    const res = await invite({
      recipientId: "88888888-8888-4888-8888-888888888888",
      displayName: "모르는 사람",
      viewScope: [],
    });
    expect(res.status).toBe(404);
  });

  it("같은 사람을 두 번 초대해도 하나다 — 재초대는 상태 갱신이다", async () => {
    const p = await person("cu3@example.org");
    await invite({ recipientId: p.id, displayName: "이가상", viewScope: ["FINANCIAL"] });
    await invite({ recipientId: p.id, displayName: "이가상", viewScope: ["REAL_ESTATE"] });
    const list = await store.listCustodians(DEV_USER_ID);
    expect(list.filter((c) => c.recipientId === p.id)).toHaveLength(1);
  });

  it("열람 범위 기본값은 빈 배열 — 그것이 최소 권한이다 (D-18)", async () => {
    const p = await person("cu4@example.org");
    const { data } = await (
      await invite({ recipientId: p.id, displayName: "이가상", viewScope: [] })
    ).json();
    expect(data.custodian.viewScope).toEqual([]);
  });
});

describe("🔴 회수", () => {
  it("거둔 권한은 서명으로 되살아나지 않는다", async () => {
    const p = await person("cu5@example.org");
    const { data } = await (
      await invite({ recipientId: p.id, displayName: "이가상", viewScope: ["FINANCIAL"] })
    ).json();
    await DELETE(
      new Request(`http://localhost/api/estate/custodians?id=${data.custodian.id}`, {
        method: "DELETE",
      }),
    );
    // 회수 뒤에 뒤늦게 서명 웹훅이 와도 열리면 안 된다
    expect(await store.grantCustodian(data.draftId)).toBeUndefined();
  });

  it("남의 지킴이는 거둘 수 없다", async () => {
    const other = "99999999-9999-4999-8999-999999999999";
    const p = await person("cu6@example.org", other);
    const c = await store.upsertCustodian(other, {
      recipientId: p.id,
      displayName: "남의 지킴이",
      viewScope: [],
    });
    const res = await DELETE(
      new Request(`http://localhost/api/estate/custodians?id=${c.id}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(404);
    expect((await store.listCustodians(other))[0]?.status).toBe("PENDING"); // 살아 있어야 한다
  });

  it("목록은 내 것만 나온다", async () => {
    const res = await GET(new Request("http://localhost/api/estate/custodians"));
    const { data } = await res.json();
    const mine = await store.listCustodians(DEV_USER_ID);
    expect(data.custodians).toHaveLength(mine.length);
  });
});
