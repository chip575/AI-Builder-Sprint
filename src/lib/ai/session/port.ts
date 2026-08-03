// ResponderPort — 축·가지 대화 응답 경계 (FR-101 · FR-110)
// 토큰 스트림을 낸다 — 첫 토큰까지의 시간이 NFR-702의 기준이므로,
// 전체 응답을 받아 한 번에 뱉는 구조로 만들면 그 지표가 무의미해진다.
import type { BranchType, DocType } from "../../contracts/common";
import type { Utterance } from "./store";

export interface RespondInput {
  utterances: Utterance[];
  /** Express로 확정된 가지. null이면 축(회상 인터뷰) */
  branchType: BranchType | null;
  /** 작성실이면 그 서류. 프롬프트가 서류별 주의사항을 싣는 근거가 된다 */
  docType?: DocType;
  /** 사용자가 방금 흐름을 부정했다 ("아니 …"). 슬롯을 묻지 말고 먼저 확인하라는 신호 */
  corrected?: boolean;
  /** 세션이 **이미 아는** 값. 이걸 안 넘기면 응답기는 사용자가 방금 말한 것을 다시 묻는다 —
   *  코드가 아는 것을 모델에게 알려주지 않고 추측을 기대하는 실수다 (eval 41.7%와 같은 계열) */
  knownFacts: { key: string; value: string | number }[];
  /** 아직 비어 있는 필수 슬롯. 다음에 물을 것이 여기서 정해진다 */
  missingRequired: string[];
  /** 축 세션에서 다음에 던질 회상 질문 (lib/rules/question-bank).
   *  가지 세션이면 null — 가지는 슬롯을 모으지 회상을 하지 않는다 */
  nextAxisQuestion: string | null;
  /** 코드가 만든 재산 사실 문장 (lib/ai/prompts/asset-readback).
   *  **감지하지 않고 매 턴 넣는다** — 정규식으로 "재산을 물었나"를 가리면 재산어가
   *  없는 말("이거 애들한테 어떻게 하면 좋을까요")을 놓치고, 그때 모델은 아무것도
   *  모르는 채로 답한다. 조회 실패면 null: 못 읽은 것과 없는 것은 다르다 */
  assetLine: string | null;
}

export interface ResponderPort {
  respond(input: RespondInput): AsyncIterable<string>;
}
