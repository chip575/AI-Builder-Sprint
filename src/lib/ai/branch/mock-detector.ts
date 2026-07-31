// mockDetector — 키 없이 도는 결정론적 감지 (NFR-707)
//
// 규칙표를 새로 쓰지 않고 lib/rules/express-detect.ts를 그대로 부른다.
// 같은 어휘가 첫 발화에선 EXPRESS로, 대화 중엔 DETECTED로 읽히는 것뿐이라
// 표가 둘이 되면 "부산에 기부하고 싶어요"가 자리에 따라 다르게 판정된다.
import { detectExpress } from "../../rules/express-detect";
import type { BranchSignal, DetectInput, DetectorPort } from "./port";

export class MockDetector implements DetectorPort {
  /** 방금 한 발화만 본다 — 지난 발화를 매번 다시 훑으면 같은 신호가 계속 되살아난다 */
  async detect(input: DetectInput): Promise<BranchSignal[]> {
    const latest = input.utterances[input.utterances.length - 1];
    if (!latest) return [];
    const hit = detectExpress(latest.text);
    if (hit.kind !== "EXPRESS") return [];
    return [{ branchType: hit.branchType, sourceUtteranceId: latest.id }];
  }
}
