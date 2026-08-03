// M-RECIPIENT — 알릴 상대 (FR-405 · NFR-714)
//
// 이 목록의 주소로 **통지가 나간다.** 통지서에는 이름과 약정 내용이 실린다.
// 그래서 검사의 무게중심이 "저장되나"가 아니라 **"남의 것을 건드릴 수 있나"** 와
// **"개인정보가 응답·에러로 새나"** 에 있다.
import { describe, expect, it } from "vitest";
import { store } from "@/lib/store";
import { DELETE, GET, POST } from "./route";
import { maskEmail } from "@/app/(ui)/(m0)/mypage/RecipientBook";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const org = { kind: "ORG", name: "부산 지역아동센터", email: "help@example.org" };

describe("등록·목록", () => {
  it("등록 응답이 목록 한 벌이다 — 화면이 상태를 따로 잇지 않게", async () => {
    const { data } = await (await post(org)).json();
    expect(data.recipients.some((r: { name: string }) => r.name === org.name)).toBe(true);
  });

  it("같은 역할·이메일을 다시 넣으면 늘지 않고 고쳐진다", async () => {
    // 중복 등록은 통지를 두 번 보내는 결과가 된다
    await post({ ...org, email: "dup@example.org" });
    const before = (await (await post({ ...org, email: "dup@example.org" })).json()).data
      .recipients.length;
    const after = (await (
      await post({ ...org, name: "이름 바꿈", email: "dup@example.org" })
    ).json()).data.recipients.length;
    expect(after).toBe(before);
  });

  it("역할이 다르면 같은 주소라도 별개다 — 기관 담당자가 유가족일 수 있다", async () => {
    await post({ kind: "ORG", name: "가상재단", email: "both@example.org" });
    const { data } = await (
      await post({ kind: "FAMILY", name: "김가상", relation: "장녀", email: "both@example.org" })
    ).json();
    const same = data.recipients.filter(
      (r: { email: string }) => r.email === "both@example.org",
    );
    expect(same).toHaveLength(2);
  });

  it("?kind로 거른다 — 거르는 일을 화면에 맡기지 않는다", async () => {
    await post({ kind: "CUSTODIAN", name: "이가상", relation: "조카", email: "cu@example.org" });
    const res = await GET(new Request("http://localhost/api/recipients?kind=CUSTODIAN"));
    const { data } = await res.json();
    expect(data.recipients.length).toBeGreaterThan(0);
    expect(data.recipients.every((r: { kind: string }) => r.kind === "CUSTODIAN")).toBe(true);
  });
});

describe("🔴 남의 것을 건드릴 수 있나", () => {
  it("다른 사용자의 항목은 지워지지 않는다", async () => {
    const other = "44444444-4444-4444-8444-444444444444";
    const mine = await store.upsertRecipient(other, {
      kind: "ORG",
      name: "남의 기관",
      email: "other@example.org",
    });
    const res = await DELETE(
      new Request(`http://localhost/api/recipients?id=${mine.id}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(404);
    // 실제로 살아 있어야 한다 — 404만 보고 안심하면 안 된다
    expect(await store.listRecipients(other)).toHaveLength(1);
  });

  it("없는 id와 남의 id가 같은 응답이다 — 다르면 남의 id를 탐색할 수 있다", async () => {
    const res = await DELETE(
      new Request(
        "http://localhost/api/recipients?id=55555555-5555-4555-8555-555555555555",
        { method: "DELETE" },
      ),
    );
    expect(res.status).toBe(404);
  });
});

describe("🔴 개인정보가 새나 (보안 1조)", () => {
  it("검증 실패 에러에 입력한 주소를 되싣지 않는다", async () => {
    const res = await post({ kind: "ORG", name: "가상", email: "이건-주소가-아님" });
    const body = JSON.stringify(await res.json());
    expect(res.status).toBe(400);
    expect(body).not.toContain("이건-주소가-아님");
    // 무엇이 틀렸는지는 알려 준다 — 알려주지 않으면 사용자가 고칠 수 없다
    expect(body).toContain("이메일");
  });

  it("응답에 소유자(userId)를 싣지 않는다 — 소유자는 쿠키가 정한다", async () => {
    const { data } = await (await post(org)).json();
    expect(JSON.stringify(data)).not.toContain("userId");
  });
});

describe("마스킹 — 오타는 잡히되 어깨너머로는 안 읽히게", () => {
  it("앞 두 글자와 도메인은 남긴다", () => {
    expect(maskEmail("helpdesk@example.org")).toBe("he******@example.org");
  });

  it("짧은 주소도 도메인을 남긴다 — 어디로 가는지는 보여야 한다", () => {
    expect(maskEmail("ab@example.org")).toBe("ab@example.org");
  });
});
