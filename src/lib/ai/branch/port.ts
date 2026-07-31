// DetectorPort — 대화 중 가지 신호 감지 경계 (FR-115A)
//
// ⚠ 이 경계가 내는 것은 **신호뿐이다.** 무게 등급(LIGHT/MEDIUM/HEAVY)은
//    lib/rules/branch-weight.ts가 정한다 — 모델에게 등급을 묻지 않는다.
//    등급이 프롬프트로 새는 순간 "같은 세션 내 체결 금지"가 모델의 기분이 된다.
import type { BranchType } from "../../contracts/common";
import type { Utterance } from "../session/store";

export interface DetectInput {
  /** 살아있는 발화들. **마지막 원소가 방금 한 발화**다 (삭제분은 이미 빠져 있다) */
  utterances: Utterance[];
}

/** 감지 결과 1건. 근거 발화가 필수 필드다 — 근거 없는 신호는 만들 수 없다 */
export interface BranchSignal {
  branchType: BranchType;
  /** 근거가 된 발화의 id. 실재하지 않으면 제안 단계에서 버려진다 */
  sourceUtteranceId: string;
}

export interface DetectorPort {
  detect(input: DetectInput): Promise<BranchSignal[]>;
}
