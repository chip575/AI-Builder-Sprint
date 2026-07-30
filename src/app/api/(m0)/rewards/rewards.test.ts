// M-REWARDS 테스트 (FR-203)
import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { POST } from "./select/route";
import { REWARD_SEEDS, SEED_ORG_ID } from "./seed";

function select(rewardIds: string[], amount: number) {
  return POST(
    new Request("http://localhost/api/rewards/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rewardIds, amount }),
    }),
  );
}

const byName = (name: string) => REWARD_SEEDS.find((r) => r.name.includes(name))!;

describe("M-REWARDS — 목록 (FR-203)", () => {
  it("금지 품목(현금·귀금속·유가증권)은 데이터에 존재하지 않는다", async () => {
    const res = await GET(new Request(`http://localhost/api/rewards?orgId=${SEED_ORG_ID}`));
    const { data } = await res.json();
    expect(data.length).toBeGreaterThan(0);
    for (const r of data) {
      expect(r.name).not.toMatch(/현금|상품권|금|은|귀금속|증권/);
    }
  });
});

describe("M-REWARDS — 선택 판정 (서버 최종)", () => {
  it("10만원 기부 + 3만원 이하 조합 → 200, remaining 정확", async () => {
    const picks = [byName("과자"), byName("김")]; // 12,000 + 15,000 = 27,000
    const res = await select(picks.map((r) => r.id), 100_000);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.selected).toHaveLength(2);
    expect(data.remaining).toBe(30_000 - 27_000);
    expect(data.overLimit).toBe(false);
  });

  it("한도 초과 조합 → 422 거부 — 클라이언트 조작도 서버가 막는다 (P3·FR-203)", async () => {
    const picks = [byName("과자"), byName("찻잔")]; // 12,000 + 22,000 = 34,000 > 30,000
    const res = await select(picks.map((r) => r.id), 100_000);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("REWARD_LIMIT_EXCEEDED");
    expect(body.error.nextAction).toBeTruthy();
  });

  it("선택 0건도 유효한 완료 — remaining이 곧 한도 (한도 조회 겸용)", async () => {
    const res = await select([], 100_000);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.selected).toHaveLength(0);
    expect(data.remaining).toBe(30_000); // 10만원의 30% — 계산은 lib/rules
    expect(data.overLimit).toBe(false);
  });

  it("목록에 없는 rewardId → 400 UNKNOWN_REWARD", async () => {
    const res = await select(["00000000-0000-4000-8000-00000000dead"], 100_000);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("UNKNOWN_REWARD");
  });

  it("금액 0 이하 → 400 (zod)", async () => {
    expect((await select([], 0)).status).toBe(400);
  });
});
