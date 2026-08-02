// M-CLM 목록 — 소유자 격리가 이 라우트의 존재 이유다.
//
// 서비스 롤로 붙으므로 RLS가 걸러주지 않는다 (D-18). 필터를 빠뜨리면 남의 서류가
// 그대로 나오고, **목록은 한 건 조회와 달리 그 자체가 명세**라 피해가 크다.
import { describe, expect, it } from "vitest";
import { store } from "@/lib/store";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { GET } from "./route";

const get = (query = "") =>
  GET(new Request(`http://localhost/api/clm/documents${query}`));

/** 특정 사용자의 문서 1건 */
async function draftFor(userId: string, docType: "DONATION_PLEDGE" | "HANDWRITTEN_WILL") {
  const s = await store.getOrCreateSession(null, userId);
  return store.createDraft(s.id, docType, evaluateGate(docType));
}

describe("🔴 M-CLM — 소유자 격리", () => {
  it("남의 서류는 나오지 않는다", async () => {
    const mine = await draftFor("11111111-1111-4111-8111-111111111111", "DONATION_PLEDGE");
    await draftFor("22222222-2222-4222-8222-222222222222", "DONATION_PLEDGE");

    // 인증이 꺼진 환경(키 없는 채점 경로)에서는 DEV_USER_ID로 조회된다 —
    // 그 사용자의 문서만 나와야 하고, 위 둘은 어느 쪽도 여기 속하지 않는다
    const { data } = await (await get()).json();
    const ids = data.documents.map((d: { draftId: string }) => d.draftId);
    expect(ids).not.toContain(mine.draftId);
  });

  it("내 서류는 나온다 — 격리한다고 전부 막으면 화면이 죽는다", async () => {
    const s = await store.getOrCreateSession(); // DEV_USER_ID
    const d = await store.createDraft(s.id, "DONATION_PLEDGE", evaluateGate("DONATION_PLEDGE"));

    const { data } = await (await get()).json();
    const ids = data.documents.map((x: { draftId: string }) => x.draftId);
    expect(ids).toContain(d.draftId);
  });
});

describe("M-CLM — 목록 내용", () => {
  it("모두싸인에 없는 문서도 목록에 선다 (자필유언)", async () => {
    // 외부를 축으로 잡으면 사라지는 바로 그 항목이다
    const s = await store.getOrCreateSession();
    const will = await store.createDraft(s.id, "HANDWRITTEN_WILL", evaluateGate("HANDWRITTEN_WILL"));

    const { data } = await (await get()).json();
    const row = data.documents.find((d: { draftId: string }) => d.draftId === will.draftId);
    expect(row).toBeTruthy();
    expect(row.hasExternal).toBe(false); // 전자서명 대상이 아니다 — 없는 것이 정상
    expect(row.verdict).toBe("ESIGN_INVALID"); // 왜 서명이 없는지가 목록에서 보인다
  });

  it("모르는 필터 값은 무시한다 — 목록이 통째로 비지 않게", async () => {
    const s = await store.getOrCreateSession();
    await store.createDraft(s.id, "DONATION_PLEDGE", evaluateGate("DONATION_PLEDGE"));

    const { data } = await (await get("?docType=NOPE&status=WAT")).json();
    expect(data.documents.length).toBeGreaterThan(0);
  });

  it("유형 필터가 실제로 거른다", async () => {
    const s = await store.getOrCreateSession();
    await store.createDraft(s.id, "HANDWRITTEN_WILL", evaluateGate("HANDWRITTEN_WILL"));

    const { data } = await (await get("?docType=HANDWRITTEN_WILL")).json();
    expect(data.documents.length).toBeGreaterThan(0);
    for (const d of data.documents) expect(d.docType).toBe("HANDWRITTEN_WILL");
  });
});
