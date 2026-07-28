// M-SESSION-MSG — mock 응답기 (UPSTAGE_MODE=mock · NFR-707)
// 결정론적 고정 응답. Solar 연동이 붙어도 이 fixtures는 데모·테스트 경로로 유지된다.
//
// 문구 규칙 (P4 · NFR-708): 긴급성 표현("지금", "빨리", "놓치기 전에") 금지.
// 법률 수치 금지 (P3): 계산 언급은 "확인 화면에서 계산"으로만 — 숫자는 lib/rules가 낸다.
import type { BranchType } from "../../contracts/common";

/** 축(회상 인터뷰) 시작 — 한 번에 하나의 질문 (FR-101) */
const SPINE_OPENER =
  "말씀 고맙습니다. 편하게 이어가 주세요. 요즘 마음에 자주 머무는 사람이나 장면이 있다면, 그 이야기부터 들려주시겠어요?";

/** Express 직행 — 가지별 슬롯 수집 시작. 회상 질문 없음 (FR-115B 수락 기준) */
const EXPRESS_REPLIES: Record<BranchType, string> = {
  DONATION_NOW:
    "고향에 마음을 보태고 싶으시군요. 기부하실 지역과 금액부터 차근차근 정리해 볼게요. 예상 세액공제는 확인 화면에서 계산해 드립니다. 어느 지역에 기부하고 싶으신가요?",
  HERITAGE_SUPPORT:
    "문화유산을 지키는 데 마음을 보태고 싶으시군요. 후원하실 대상과 방식을 정리해 볼게요. 어떤 유산이 마음에 남으셨나요?",
  ESTATE:
    "무엇이 어디에 있는지부터 차근차근 정리해 볼게요. 먼저 떠오르는 것 하나만 말씀해 주시겠어요?",
  // 무거운 가지 — 고지 + 오늘/다음에 선택. 재촉 문구 없음 (FR-115B 수락 기준)
  LEGACY_GIFT:
    "남기시려는 뜻이 잘 전해지도록 정리하겠습니다. 사후 기부 약정은 가족의 유류분에 영향을 줄 수 있어, 관련 고지를 먼저 확인해 주세요. 오늘 진행하셔도 되고, 다음에 하셔도 됩니다.",
  HANDWRITTEN_WILL:
    "유언장을 준비하려는 마음, 소중히 받겠습니다. 유언장은 법이 정한 자필 방식으로만 효력이 생겨서, 전자서명이 아니라 손으로 옮겨 적는 과정을 안내해 드립니다. 오늘 진행하셔도 되고, 다음에 하셔도 됩니다.",
};

export function mockReply(branchType: BranchType | null): string {
  return branchType ? EXPRESS_REPLIES[branchType] : SPINE_OPENER;
}

/** SSE token 이벤트로 흘릴 조각 — 어절 단위 분할 (결정론적) */
export function tokenize(reply: string): string[] {
  return reply.split(/(?<= )/); // 공백 뒤에서 자르되 공백은 보존
}
