// M-LEDGER 조회 — **id만 알면 남의 뜻 이력이 보이던 구멍**을 닫은 자리 (NFR-714)
//
// 쌍으로 잰다: 막혀야 할 것과 **통과해야 할 것**을 함께 본다.
// 막히는 것만 보면 "전부 막는 검사"와 "규칙대로 막는 검사"를 구분할 수 없다.
import { describe, expect, it } from "vitest";
import { DEV_USER_ID } from "@/lib/store/types";
import { store } from "@/lib/store";
import { GET } from "./route";

async function seed(userId: string) {
  const session = await store.getOrCreateSession(null, userId);
  await store.appendLedgerNode({
    subjectId: session.id,
    changeSummary: { first: true },
    changeReason: "처음 남긴 뜻",
    materiality: "MATERIAL",
  });
  return session.id;
}

const read = (subjectId: string) =>
  GET(new Request(`http://localhost/api/ledger/${subjectId}`), {
    params: Promise.resolve({ subjectId }),
  });

describe("원장 조회 — 소유 확인", () => {
  it("🔴 남의 이력은 보이지 않는다", async () => {
    const other = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const subjectId = await seed(other);
    const res = await read(subjectId);
    expect(res.status).toBe(404);
  });

  it("없는 id와 남의 id가 같은 응답이다 — 다르면 남의 id를 탐색할 수 있다", async () => {
    const res = await read("ffffffff-ffff-4fff-8fff-ffffffffffff");
    expect(res.status).toBe(404);
  });

  it("내 이력은 그대로 보인다 — 통과 케이스", async () => {
    const subjectId = await seed(DEV_USER_ID);
    const res = await read(subjectId);
    const { ok, data } = await res.json();
    expect(ok).toBe(true);
    expect(data.nodes.length).toBeGreaterThan(0);
    // 이 화면의 존재 이유가 이 한 값이다 (FR-553)
    expect(data.chainValid).toBe(true);
  });
});
