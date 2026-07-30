// M-OBSERVABILITY 테스트 (NFR-709)
import { describe, expect, it } from "vitest";
import { store } from "@/lib/store";
import { PIPELINE_STAGES, track } from "@/lib/observability/track";
import { summarizeMetrics } from "@/lib/store/percentile";
import { GET } from "./route";

const stats = async () => (await (await GET()).json()).data;

describe("M-OBSERVABILITY — 집계", () => {
  it("6단계가 모두 노출된다 — 기록이 없는 단계도 0으로", async () => {
    const d = await stats();
    expect(d.stages.map((s: { stage: string }) => s.stage)).toEqual([
      ...PIPELINE_STAGES,
    ]);
  });

  it("성공·실패가 분리되어 집계된다", async () => {
    const before = (await stats()).stages.find(
      (s: { stage: string }) => s.stage === "CUSTODY",
    );
    await store.recordMetric({ stage: "CUSTODY", ok: true, ms: 10 });
    await store.recordMetric({ stage: "CUSTODY", ok: false, ms: 20 });
    const after = (await stats()).stages.find(
      (s: { stage: string }) => s.stage === "CUSTODY",
    );
    expect(after.success).toBe(before.success + 1);
    expect(after.fail).toBe(before.fail + 1);
  });

  it("track()은 적재 실패에도 던지지 않는다 (관측이 기능을 죽이지 않는다)", () => {
    expect(() => track("GATE", true, 5)).not.toThrow();
  });
});

describe("분위수 계산 — 두 구현이 같은 코드를 쓴다", () => {
  const rec = (ms: number, ok = true) => ({ stage: "EXTRACT", ok, ms });

  it("p50·p95를 최근접 순위로 낸다", () => {
    const s = summarizeMetrics(
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => rec(n)),
    ).find((x) => x.stage === "EXTRACT")!;
    expect(s.success).toBe(10);
    expect(s.p50Ms).toBe(50);
    expect(s.p95Ms).toBe(100);
  });

  it("기록이 없으면 null (0이 아니다 — 측정 안 됨과 0ms는 다르다)", () => {
    const s = summarizeMetrics([]).find((x) => x.stage === "SIGN")!;
    expect(s.p50Ms).toBeNull();
    expect(s.p95Ms).toBeNull();
    expect(s.success).toBe(0);
  });

  it("1건이면 p50=p95=그 값", () => {
    const s = summarizeMetrics([rec(42)]).find((x) => x.stage === "EXTRACT")!;
    expect(s.p50Ms).toBe(42);
    expect(s.p95Ms).toBe(42);
  });
});
