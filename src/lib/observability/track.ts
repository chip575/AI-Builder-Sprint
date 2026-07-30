// NFR-709 — 6단계 실행 지표(성공/실패/소요시간) 수집 지점.
//
// ⚠ 관측이 기능을 죽이면 안 된다 — 적재 실패는 로그만 남기고 본 흐름은 진행한다.
// ⚠ 키 없는 환경에서도 돌아야 한다 (NFR-707) — StorePort 경유라 인메모리에서도 집계된다.
import { store } from "../store";
import type { PipelineStage } from "./stages";

// 단계 목록은 stages.ts에 있다 — 여기 두면 store가 그것을 참조하며 순환이 생긴다
export { PIPELINE_STAGES, type PipelineStage } from "./stages";

export function track(stage: PipelineStage, ok: boolean, ms: number): void {
  void store
    .recordMetric({ stage, ok, ms: Math.max(Math.round(ms), 0) })
    .catch((err) =>
      console.warn("[track] 지표 적재 실패 — 본 흐름은 진행:", (err as Error).message),
    );
}
