// p50/p95 — 앱에서 계산한다. 데이터가 수백 건 규모라 DB percentile 함수까지 갈 필요가 없고,
// 같은 코드가 인메모리·Supabase 양쪽에서 돌아 두 구현의 수치가 어긋나지 않는다.
import { PIPELINE_STAGES } from "../observability/stages";
import type { MetricRecord, StageStat } from "./types";

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  // 최근접 순위법 — 표본이 적을 때 보간보다 읽기 쉽다
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(idx, 0)] ?? null;
}

/** 단계별 성공·실패 수와 지연 분위수. 기록이 없는 단계도 0으로 노출한다 */
export function summarizeMetrics(records: MetricRecord[]): StageStat[] {
  return PIPELINE_STAGES.map((stage) => {
    const rows = records.filter((r) => r.stage === stage);
    const durations = rows.map((r) => r.ms).sort((a, b) => a - b);
    return {
      stage,
      success: rows.filter((r) => r.ok).length,
      fail: rows.filter((r) => !r.ok).length,
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
    };
  });
}
