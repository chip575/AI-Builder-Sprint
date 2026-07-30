// ResponderPort — 축·가지 대화 응답 경계 (FR-101 · FR-110)
// 토큰 스트림을 낸다 — 첫 토큰까지의 시간이 NFR-702의 기준이므로,
// 전체 응답을 받아 한 번에 뱉는 구조로 만들면 그 지표가 무의미해진다.
import type { BranchType } from "../../contracts/common";
import type { Utterance } from "./store";

export interface RespondInput {
  utterances: Utterance[];
  /** Express로 확정된 가지. null이면 축(회상 인터뷰) */
  branchType: BranchType | null;
}

export interface ResponderPort {
  respond(input: RespondInput): AsyncIterable<string>;
}
