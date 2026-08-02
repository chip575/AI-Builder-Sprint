// 대화 → 상태기계 인계 (FR-115B · FR-103)
//
// 도돌이표의 해부 (2026-08-02 실사용에서 발견):
//   숙려 결정(오늘/다음에)은 decide API(버튼)만 상태를 바꾸는데, 응답기가 그 질문을
//   **채팅으로** 던졌다. 사용자는 채팅으로 "네"라 답하고, 상태는 그대로고, 응답기는
//   또 물었다 — 대화와 상태기계가 서로 다른 문으로 말한 것이다.
//
// 규칙: 다음 행동이 대화가 아니라 **버튼/화면**에 있을 때는 LLM을 부르지 않는다.
// 코드가 그 문을 가리키는 문장을 내고 끝낸다. LLM은 아직 물을 것이 남았을 때만 말한다.
import type { BranchType } from "../../contracts/common";

export interface HandoffInput {
  branchType: BranchType | null;
  missingRequired: string[];
  knownFacts: { key: string; value: string | number }[];
  /** 최신 제안이 재확인 대기면 그 origin. 아니면 null */
  pendingReconfirm: "EXPRESS" | "DETECTED" | null;
}

const FACT_LABEL: Record<string, string> = {
  region: "기부하실 지역",
  amount: "금액",
  orgName: "받으실 곳",
};

function readback(facts: HandoffInput["knownFacts"]): string {
  return facts
    .map((f) => {
      const v =
        f.key === "amount" && typeof f.value === "number"
          ? `${f.value.toLocaleString("ko-KR")}원`
          : String(f.value);
      return `${FACT_LABEL[f.key] ?? f.key}은(는) ${v}`;
    })
    .join(", ");
}

/**
 * 다음 행동이 화면에 있으면 그 문장을, 대화에 있으면 null을 돌려준다.
 * ⚠ 재촉 표현(지금·빨리·놓치기 전에) 금지 — 문구를 고치면 쌍 검사를 함께 본다 (P4).
 */
export function handoffReply(input: HandoffInput): string | null {
  // 1) 숙려 대기 — 결정은 버튼이 받는다. 채팅의 "네"는 기록이 되지 않는다
  if (input.pendingReconfirm === "EXPRESS") {
    return (
      "이 결정은 무게가 있어서, 화면의 버튼(“오늘 시작할게요 / 다음에 할게요”)으로 " +
      "남겨 주셔야 진행됩니다 — 버튼으로 남겨야 결정이 기록으로 남거든요. " +
      "물론 더 생각하셔도 됩니다."
    );
  }
  if (input.pendingReconfirm === "DETECTED") {
    return (
      "무게가 있는 결정이라, 다음에 오셨을 때 한 번 더 여쭙고 진행하겠습니다. " +
      "오늘은 다른 이야기를 이어가셔도 좋아요."
    );
  }

  // 2) 가지 슬롯 완성 — 다음 행동은 확인 화면이다. 같은 질문을 되풀이하지 않는다
  if (
    input.branchType &&
    input.missingRequired.length === 0 &&
    input.knownFacts.length > 0
  ) {
    return (
      `말씀하신 내용이 정리되었습니다 — ${readback(input.knownFacts)}. ` +
      "위의 확인 버튼을 눌러 살펴봐 주세요. 고칠 것이 있으면 거기서 바로 고치실 수 " +
      "있고, 더 남기실 말씀이 있으면 계속 이야기하셔도 됩니다."
    );
  }

  // 3) 그 외 — 대화가 할 일이 남았다. 응답기(LLM)의 차례다
  return null;
}
