// M-FACTS·M-EXTRACT 조회 — **세션 id만 알면 남의 대화에서 뽑은 값이 보이던 구멍** (NFR-714)
//
// extract는 읽기이면서 **쓰기**이기도 하다(saveFacts) — 남의 세션에 값을 남기는
// 경로이기도 했다. 그래서 둘을 함께 잰다.
import { describe, expect, it } from "vitest";
import { DEV_USER_ID } from "@/lib/store/types";
import { store } from "@/lib/store";
import { GET } from "./route";
import { POST as EXTRACT } from "../extract/route";

async function seed(userId: string) {
  const s = await store.getOrCreateSession(null, userId);
  await store.addUtterance(s.id, "부산에 백만원 기부하고 싶어요");
  return s.id;
}

const facts = (intentId: string) =>
  GET(new Request(`http://localhost/api/facts?intentId=${intentId}`));

const extract = (intentId: string) =>
  EXTRACT(
    new Request("http://localhost/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId }),
    }),
  );

describe("확인표·구조화 — 소유 확인", () => {
  it("🔴 남의 대화에서 뽑은 값은 보이지 않는다", async () => {
    const other = "11111111-2222-4333-8444-555555555555";
    const intentId = await seed(other);
    expect((await facts(intentId)).status).toBe(404);
  });

  it("🔴 남의 대화를 구조화할 수 없다 — 쓰기 경로이기도 하다", async () => {
    const other = "11111111-2222-4333-8444-666666666666";
    const intentId = await seed(other);
    expect((await extract(intentId)).status).toBe(404);
    // 실제로 값이 안 남아야 한다 — 404만 보고 안심하면 안 된다
    expect((await store.getSession(intentId))?.facts ?? []).toHaveLength(0);
  });

  it("내 대화는 그대로 된다 — 통과 케이스", async () => {
    const intentId = await seed(DEV_USER_ID);
    expect((await extract(intentId)).status).toBe(200);
    const { ok, data } = await (await facts(intentId)).json();
    expect(ok).toBe(true);
    expect(data.facts.length).toBeGreaterThan(0);
  });
});
