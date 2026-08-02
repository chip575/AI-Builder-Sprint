// M-SESSION-MSG — mock 응답기 (UPSTAGE_MODE=mock · NFR-707)
//
// 결정론적이되 **대화 상태를 따라간다.** 고정 문구 하나만 돌려주면 사용자가 무슨 말을 하든
// 같은 답이 나오고, 그 순간 "대화로 정리한다"는 전제가 화면에서 무너진다.
//
// 두 가지가 응답을 정한다:
//   · 가지 세션 → **아직 비어 있는 슬롯**을 묻는다. 이미 말한 것은 다시 묻지 않는다
//   · 축 세션   → **질문은행**(lib/rules/question-bank)이 고른 다음 질문을 던진다
//
// 문구 규칙 (P4 · NFR-708): 긴급성 표현("지금", "빨리", "놓치기 전에") 금지.
// 법률 수치 금지 (P3): 계산 언급은 "확인 화면에서 계산"으로만 — 숫자는 lib/rules가 낸다.
import type { BranchType } from "../../contracts/common";
import type { RespondInput } from "./port";

/** 가지 진입 첫 인사 — 슬롯을 묻기 전에 마음을 먼저 받는다 */
const BRANCH_GREETING: Record<BranchType, string> = {
  DONATION_NOW: "고향에 마음을 보태고 싶으시군요.",
  HERITAGE_SUPPORT: "문화유산을 지키는 데 마음을 보태고 싶으시군요.",
  ESTATE: "무엇이 어디에 있는지부터 차근차근 정리해 볼게요.",
  LEGACY_GIFT: "남기시려는 뜻이 잘 전해지도록 정리하겠습니다.",
  HANDWRITTEN_WILL: "유언장을 준비하려는 마음, 소중히 받겠습니다.",
};

/** 무거운 가지는 고지가 먼저다. 슬롯 수집으로 바로 들어가지 않는다 (FR-115B) */
const HEAVY_NOTICE: Partial<Record<BranchType, string>> = {
  LEGACY_GIFT:
    "사후 기부 약정은 가족의 유류분에 영향을 줄 수 있어, 관련 고지를 먼저 확인해 주세요. 오늘 진행하셔도 되고, 다음에 하셔도 됩니다.",
  HANDWRITTEN_WILL:
    "유언장은 법이 정한 자필 방식으로만 효력이 생겨서, 전자서명이 아니라 손으로 옮겨 적는 과정을 안내해 드립니다. 오늘 진행하셔도 되고, 다음에 하셔도 됩니다.",
};

/** 슬롯별 질문 — 무엇이 비었느냐에 따라 묻는 말이 달라진다 */
const SLOT_QUESTION: Record<string, string> = {
  region: "어느 지역에 마음을 두고 계신가요?",
  amount: "얼마를 보내고 싶으신지 말씀해 주시겠어요?",
  orgName: "어떤 곳에 보내고 싶으신가요?",
};

/** 이미 아는 값을 사람 말로 되짚는다 — "듣고 있다"가 보이는 자리다 */
const SLOT_LABEL: Record<string, string> = {
  region: "지역",
  amount: "금액",
  orgName: "받는 곳",
};

function readback(known: RespondInput["knownFacts"]): string {
  const parts = known
    .filter((f) => SLOT_LABEL[f.key])
    .map((f) =>
      f.key === "amount" && typeof f.value === "number"
        ? `${SLOT_LABEL[f.key]}은 ${f.value.toLocaleString("ko-KR")}원`
        : `${SLOT_LABEL[f.key]}은 ${f.value}`,
    );
  return parts.length > 0 ? `${parts.join(", ")}으로 정리해 두었어요. ` : "";
}

/**
 * 대화 상태에서 응답을 만든다.
 * ⚠ `missingRequired`를 무시하면 사용자가 방금 말한 것을 다시 묻게 된다.
 */
export function mockReply(input: RespondInput): string {
  const { branchType, knownFacts, missingRequired, nextAxisQuestion, assetLine } = input;

  // 재산 문장은 **유산 계열에만** 붙인다.
  //
  // real은 프롬프트로 재산을 늘 받아 두고 "물었을 때만 꺼낸다"를 판단하는데, mock은
  // 판단하지 않는다. 그래서 기부 가지에 붙이면 묻지도 않은 총액을 매 턴 들이대게 되고,
  // 그건 금액 제안이다 (system-prompt의 assetSection이 막으려는 바로 그것).
  // 유산·자산 정리는 목록이 대화의 전제라, 늘 보여도 방해가 아니라 근거다.
  const assetNote =
    assetLine && (branchType === "LEGACY_GIFT" || branchType === "ESTATE")
      ? `${assetLine} `
      : "";

  // ── 축(회상 인터뷰) — 질문은행이 다음 질문을 고른다 ──
  if (!branchType) {
    return nextAxisQuestion
      ? `말씀 고맙습니다. ${nextAxisQuestion}`
      : "말씀 고맙습니다. 오늘 남기신 이야기는 그대로 저장되었습니다. 다음에 이어서 하셔도 됩니다.";
  }

  // ── 무거운 가지 — 고지가 먼저, 슬롯은 그다음 ──
  // 고지가 먼저다 — 재산 문장도 그 뒤로 밀린다. 무게 있는 결정 앞에서 총액을
  // 먼저 보여주면, 고지를 읽기 전에 규모부터 눈에 들어온다
  const notice = HEAVY_NOTICE[branchType];
  if (notice && knownFacts.length === 0) {
    return `${BRANCH_GREETING[branchType]} ${notice}`;
  }

  // ── 가지 — 비어 있는 것만 묻는다 ──
  const next = missingRequired[0];
  const greeting = knownFacts.length === 0 ? `${BRANCH_GREETING[branchType]} ` : "";
  if (next) {
    const question = SLOT_QUESTION[next] ?? "조금만 더 말씀해 주시겠어요?";
    return `${greeting}${assetNote}${readback(knownFacts)}${question}`;
  }

  // 필요한 것이 다 모였다 — 다음 화면으로 넘어갈 때다
  return `${assetNote}${readback(knownFacts)}필요한 내용이 모였습니다. 확인 화면에서 함께 살펴보시겠어요? 예상 세액공제도 거기서 계산해 보여 드립니다.`;
}

/** SSE token 이벤트로 흘릴 조각 — 어절 단위 분할 (결정론적) */
export function tokenize(reply: string): string[] {
  return reply.split(/(?<= )/); // 공백 뒤에서 자르되 공백은 보존
}
