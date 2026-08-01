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
    // EXPRESS(확신)와 UNCERTAIN(신호) 둘 다 제안 대상이다.
    //
    // 확신 수준에 따라 **개입 강도**가 다르다: EXPRESS는 첫 발화에서 가지로 직행하고,
    // UNCERTAIN은 여기서 확인형 제안이 되어 사용자가 연다. "부산에 기부는 어떻게 해?"는
    // 의지 표명이 아니라 질문이므로 바로 약정으로 끌고 가지 않는 것이 맞다.
    //
    // UNCERTAIN을 버리면 규칙이 놓친 발화가 **아무 데도 닿지 못하고** 축으로 떨어진다 —
    // 규칙은 확신 케이스만 잡고 나머지를 넘기라고 있는 것이므로, 넘길 곳이 없으면
    // 3분기 설계를 2분기로 소비하는 셈이다.
    //
    // 재제안 금지·중복 방지는 proposeBranches가 closed/seen으로 건다 — 여기서 걸지 않는다
    if (hit.kind === "NONE") return [];
    return [{ branchType: hit.branchType, sourceUtteranceId: latest.id }];
  }
}
