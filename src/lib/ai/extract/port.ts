// ExtractPort — 구조화 추출의 어댑터 경계 (SignerPort와 같은 구조).
// 대화 구조화는 Solar structured output 담당이고 IE는 문서 전용 (D-06).
// 포트로 감싸두면 실제 Solar가 붙을 때 라우트 코드를 뜯지 않는다.
import type { BranchType } from "../../contracts/common";
import type { IntentFactList } from "../../contracts/extract";
import type { Utterance } from "../session/store";

export interface ExtractInput {
  intentId: string;
  branchType: BranchType | null; // null = 축 세션 (가지별 필수 슬롯 없음)
  utterances: Utterance[];
}

export interface ExtractorPort {
  /** 세션 단위 1회 호출 — 슬롯이 다 찼는지 판단(되묻기)은 세션 쪽 책임이다 */
  extract(input: ExtractInput): Promise<IntentFactList>;
}
