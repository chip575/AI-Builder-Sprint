// M-OBLIGATIONS · M-TIMETRAVEL 테스트 (FR-204 · FR-508 · NFR-707 · NFR-708)
//
// 이 모듈에서 지켜야 하는 것은 "알림이 간다"가 아니라 **"독촉이 되지 않는다"**이다.
// 중복 발화 금지와 긴급성 어휘 부재가 그래서 테스트다.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { store } from "@/lib/store";
import { DEV_USER_ID } from "@/lib/store/types";
import { GET as summary } from "@/app/api/(m1)/admin/summary/route";
import { POST as advanceTime } from "@/app/api/(m1)/dev/advance-time/route";
import { GET as listFired, POST as fire } from "./fire/route";

const monthsFromNow = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString();
};

const fireNow = () =>
  fire(new Request("http://localhost/api/obligations/fire", { method: "POST" }));

const advance = (months: number) =>
  advanceTime(
    new Request("http://localhost/api/dev/advance-time", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ months }),
    }),
  );

describe("M-OBLIGATIONS — 독촉이 되지 않는다 (FR-113)", () => {
  it("같은 대상의 같은 종류는 발화 전까지 중복 생성되지 않는다", async () => {
    const subjectId = randomUUID();
    const first = await store.createObligation({
      kind: "RECURRING_RENEWAL",
      subjectId,
      dueAt: monthsFromNow(12),
    });
    const second = await store.createObligation({
      kind: "RECURRING_RENEWAL",
      subjectId,
      dueAt: monthsFromNow(12),
    });
    expect(first).toBeDefined();
    // 두 번 알리면 그건 안내가 아니라 독촉이다
    expect(second).toBeUndefined();
    expect(await store.listObligations(subjectId)).toHaveLength(1);
  });

  it("종류가 다르면 각각 만들어진다", async () => {
    const subjectId = randomUUID();
    await store.createObligation({ kind: "RECURRING_RENEWAL", subjectId, dueAt: monthsFromNow(12) });
    await store.createObligation({ kind: "WILL_REVIEW", subjectId, dueAt: monthsFromNow(6) });
    expect(await store.listObligations(subjectId)).toHaveLength(2);
  });
});

describe("M-OBLIGATIONS — 발화", () => {
  it("기한 전에는 발화하지 않는다", async () => {
    const subjectId = randomUUID();
    await store.createObligation({ kind: "WILL_REVIEW", subjectId, dueAt: monthsFromNow(6) });
    await fireNow();
    const [o] = await store.listObligations(subjectId);
    expect(o!.firedAt).toBeNull();
  });

  it("기한이 지나면 발화하고, 두 번 돌려도 한 번만 발화한다", async () => {
    const subjectId = randomUUID();
    await store.createObligation({ kind: "WILL_REVIEW", subjectId, dueAt: monthsFromNow(-1) });

    const first = await (await fireNow()).json();
    expect(first.data.fired).toBeGreaterThan(0);

    const before = (await store.listObligations(subjectId))[0]!.firedAt;
    await fireNow();
    const after = (await store.listObligations(subjectId))[0]!.firedAt;
    expect(after).toBe(before); // 재발화 없음
  });

  it("GET이 현황을 준다 — 내 것만", async () => {
    // 약속의 subjectId는 draftId다. 소유자는 그 draft가 매달린 intent가 안다 —
    // 임의 uuid로는 "내 것"이 아니므로 실제 문서를 만들어 쓴다
    const session = await store.getOrCreateSession(null, DEV_USER_ID);
    const draft = await store.createDraft(session.id, "DONATION_PLEDGE", {
      verdict: "ESIGN_OK",
      statutes: [],
    });
    await store.createObligation({
      kind: "RESUME_INVITE",
      subjectId: draft.draftId,
      dueAt: monthsFromNow(-1),
    });
    const res = await listFired(
      new Request(`http://localhost/api/obligations/fire?subjectId=${draft.draftId}`),
    );
    const { data } = await res.json();
    expect(data.obligations).toHaveLength(1);
  });

  it("🔴 남의 약속은 보이지 않는다 (NFR-714)", async () => {
    // 전에는 전체를 돌려줘서 다계정이 되는 순간 남의 약속이 보이는 모양이었다
    const other = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const session = await store.getOrCreateSession(null, other);
    const draft = await store.createDraft(session.id, "DONATION_PLEDGE", {
      verdict: "ESIGN_OK",
      statutes: [],
    });
    await store.createObligation({
      kind: "RESUME_INVITE",
      subjectId: draft.draftId,
      dueAt: monthsFromNow(-1),
    });
    const res = await listFired(
      new Request(`http://localhost/api/obligations/fire?subjectId=${draft.draftId}`),
    );
    const { data } = await res.json();
    expect(data.obligations).toHaveLength(0);
  });
});

describe("M-TIMETRAVEL — 가짜 시계를 만들지 않는다 (NFR-707)", () => {
  it("+12개월이면 12개월 뒤 약속이 실제로 발화된다", async () => {
    const subjectId = randomUUID();
    await store.createObligation({
      kind: "RECURRING_RENEWAL",
      subjectId,
      dueAt: monthsFromNow(12),
    });

    const { data } = await (await advance(12)).json();
    expect(data.advancedMonths).toBe(12);

    const [o] = await store.listObligations(subjectId);
    // 실제 발화 라우트를 그대로 태웠으므로 firedAt이 찍혀 있어야 한다
    expect(o!.firedAt).not.toBeNull();
  });

  it("+6개월로는 12개월 뒤 약속이 아직 발화되지 않는다", async () => {
    const subjectId = randomUUID();
    await store.createObligation({
      kind: "RECURRING_RENEWAL",
      subjectId,
      dueAt: monthsFromNow(12),
    });
    await advance(6);
    const [o] = await store.listObligations(subjectId);
    expect(o!.firedAt).toBeNull();
  });

  it("6·12개월 외의 값은 거부한다", async () => {
    expect((await advance(3)).status).toBe(400);
  });

  it("real 모드에서는 막는다 — 실 데이터의 기한을 당기는 것은 사고다", async () => {
    process.env.MODUSIGN_MODE = "real";
    const res = await advance(12);
    delete process.env.MODUSIGN_MODE;
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("DEV_ONLY");
  });
});

describe("M-ADMIN-OPS — 집계 (FR-604)", () => {
  it("미발화 갱신 약속이 갱신 도래 목록에 오른다", async () => {
    const subjectId = randomUUID();
    await store.createObligation({
      kind: "RECURRING_RENEWAL",
      subjectId,
      dueAt: monthsFromNow(11),
    });
    const { data } = await (await summary()).json();
    const found = data.renewalDue.find((r: { docId: string }) => r.docId === subjectId);
    expect(found).toBeDefined();
    // 이름을 저장하지 않으므로 만들어내지도 않는다 — 마스킹된 참조다 (NFR-714)
    expect(found.donorName).toContain("…");
    expect(found.donorName).toContain(subjectId.slice(-4));
  });
});

describe("M-OBLIGATIONS — 문구 (NFR-708)", () => {
  it("코드에 긴급성·독촉 어휘가 없다", () => {
    const sources = [
      "src/app/api/(m1)/obligations/fire/route.ts",
      "src/app/api/(m1)/dev/advance-time/route.ts",
      "src/app/api/(m1)/admin/summary/route.ts",
    ].map((p) => readFileSync(p, "utf-8"));
    for (const src of sources) {
      for (const w of ["서둘러", "지금 바로", "마감", "늦기 전에", "기한이 지났습니다"]) {
        expect(src).not.toContain(w);
      }
    }
  });
});
