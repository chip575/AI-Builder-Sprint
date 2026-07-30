// FR-509 — 게이트 판정 기록 지점.
//
// ⚠ 게이트(lib/rules/validity-gate.ts)는 순수 함수로 남긴다 — 판정만 한다.
//    DB 쓰기를 그 안에 넣으면 순수성이 깨지고 human_review 파일을 건드리게 된다.
//    기록은 **호출 지점**(documents·sign 라우트)에서 이 함수로 한다.
//
// ⚠ 관측이 기능을 죽이면 안 된다 — 기록 실패는 로그만 남기고 본 흐름은 진행한다.
import type { GateVerdict } from "../contracts/gate";
import { store } from "../store";

/**
 * @param wasSignAttempt 서명 경로에서 막혔는가.
 *   documents 라우트의 403 = false (문서 생성 시도)
 *   sign 라우트 재검증 차단 = true (서명 시도) — 이 구분이 카운터의 정직성이다.
 */
export function logGateVerdict(
  docType: string,
  verdict: GateVerdict,
  wasSignAttempt: boolean,
): void {
  void store
    .recordGateVerdict({
      docType,
      verdict: verdict.verdict,
      wasSignAttempt,
      statutes: verdict.statutes.map((s) => ({ id: s.id })),
    })
    .catch((err) =>
      console.warn("[gate-log] 기록 실패 — 본 흐름은 진행:", (err as Error).message),
    );
}
