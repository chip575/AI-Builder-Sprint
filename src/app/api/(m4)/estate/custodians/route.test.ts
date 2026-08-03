// M-CUSTODIAN — 지킴이 (FR-405 · NFR-713)
//
// 이 권한은 **남의 재산 목록을 보는 권한**이다. 그래서 검사의 무게중심이
// "열리나"가 아니라 **"언제 열리나 / 언제 안 열리나"** 에 있다.
import { describe, expect, it } from "vitest";
import { DEV_USER_ID } from "@/lib/store/types";
import { store } from "@/lib/store";
import { DELETE, GET, PATCH, POST } from "./route";

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

describe("🔴 열람 범위 변경 — 넓히든 좁히든 재서명이다 (NFR-713)", () => {
  const patch = (id: string, viewScope: string[]) =>
    PATCH(
      new Request(`http://localhost/api/estate/custodians?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewScope }),
      }),
    );

  it("범위를 바꾸면 열람이 닫히고 다시 서명을 받는다", async () => {
    const p = await person("sc1@example.org");
    const { data } = await (
      await invite({ recipientId: p.id, displayName: "이가상", viewScope: ["FINANCIAL"] })
    ).json();
    // 한 번 열어 둔다 — 닫히는지 보려면 열려 있어야 한다
    await store.grantCustodian(data.draftId);
    expect((await store.listCustodians(DEV_USER_ID)).find((c) => c.id === data.custodian.id)?.status).toBe("ACTIVE");

    const res = await patch(data.custodian.id, ["FINANCIAL", "REAL_ESTATE"]);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.requiresResign).toBe(true);
    // 🔴 그 사이 열람은 닫힌다 — 동의한 적 없는 범위를 보게 두지 않는다
    expect(body.data.custodian.status).toBe("PENDING");
    expect(body.data.custodian.grantedAt).toBeNull();
    expect(body.data.custodian.viewScope).toEqual(["FINANCIAL", "REAL_ESTATE"]);
  });

  it("좁히는 것도 재서명이다 — 새 약정서가 정본이다", async () => {
    const p = await person("sc2@example.org");
    const { data } = await (
      await invite({ recipientId: p.id, displayName: "이가상", viewScope: ["FINANCIAL", "DEBT"] })
    ).json();
    const body = await (await patch(data.custodian.id, [])).json();
    expect(body.data.requiresResign).toBe(true);
    expect(body.data.custodian.viewScope).toEqual([]);
  });

  it("거둔 권한은 범위 변경으로 되살아나지 않는다", async () => {
    const p = await person("sc3@example.org");
    const { data } = await (
      await invite({ recipientId: p.id, displayName: "이가상", viewScope: ["FINANCIAL"] })
    ).json();
    await DELETE(
      new Request(`http://localhost/api/estate/custodians?id=${data.custodian.id}`, { method: "DELETE" }),
    );
    const res = await patch(data.custodian.id, ["REAL_ESTATE"]);
    expect(res.status).toBe(409);
  });

  it("남의 지킴이 범위는 못 바꾼다", async () => {
    const other = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const p = await person("sc4@example.org", other);
    const c = await store.upsertCustodian(other, { recipientId: p.id, displayName: "남의 지킴이", viewScope: [] });
    expect((await patch(c.id, ["FINANCIAL"])).status).toBe(404);
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
