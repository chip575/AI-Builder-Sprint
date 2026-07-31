// 결정 표 (FR-115A · FR-115B) — 가지를 여는 것은 사용자다.
//
// 무거운 가지에 두 갈래가 있는 이유는 **방어 대상이 다르기 때문**이다 (FR-115B):
//  · DETECTED — AI가 감정적 순간에 밀어넣는 것을 막는다 → 다음 세션 재확인
//  · EXPRESS  — 본인이 스스로 시작한 것이다 → 재확인 대신 숙려 화면 1회
// 이 구분을 지우고 하나로 합치면 둘 중 하나가 반드시 틀린다.
import type { BranchDecision, BranchDecisionRes } from "../../contracts/branch";
import { isHeavy } from "../../rules/branch-weight";
import type { BranchProposalRecord } from "../../store/types";

/** 화면 라우팅 힌트 — 경로가 아니라 기호다. 경로 이름은 화면이 소유한다 */
export const NEXT_STEP = {
  /** 슬롯 대화(가지 진행) */
  SLOT_DIALOG: "SLOT_DIALOG",
  /** 숙려 화면 — 필수 고지 + "오늘 진행할게요 / 다음에 할게요" */
  DELIBERATION: "DELIBERATION",
  /** 다음 세션에 다시 확인한다 */
  NEXT_SESSION_RECONFIRM: "NEXT_SESSION_RECONFIRM",
} as const;

/**
 * 결정 → 상태. 순수 함수다 — 저장은 호출부가 한다.
 * DEFER는 거절이 아니다 (P4). DEFERRED는 닫힘이 아니므로 재제안 금지에 걸리지 않는다.
 */
export function resolveDecision(
  record: Pick<BranchProposalRecord, "branchType" | "origin">,
  action: BranchDecision["action"],
): BranchDecisionRes {
  switch (action) {
    case "ACCEPT":
      if (!isHeavy(record.branchType)) {
        // LIGHT·MEDIUM — 즉시 진행 (ESTATE의 Custodian 지정은 가지 안에서 따로 확인)
        return { status: "OPENED", nextStep: NEXT_STEP.SLOT_DIALOG };
      }
      // 무거운 가지는 승낙만으로 열리지 않는다. 같은 세션 내 체결 금지가 여기서 성립한다
      return record.origin === "EXPRESS"
        ? { status: "PENDING_RECONFIRM", nextStep: NEXT_STEP.DELIBERATION }
        : { status: "PENDING_RECONFIRM", nextStep: NEXT_STEP.NEXT_SESSION_RECONFIRM };

    case "DECLINE":
      // 닫힘. 재제안 금지가 여기서 성립한다 (StorePort.listDeclinedBranchesByUser)
      return { status: "DECLINED", nextStep: null };

    case "DEFER":
      return { status: "DEFERRED", nextStep: null };

    case "PROCEED_TODAY":
      // 숙려 화면을 거친 뒤의 진행 — 여기서만 무거운 가지가 당일 열린다 (FR-115B)
      return { status: "OPENED", nextStep: NEXT_STEP.SLOT_DIALOG };

    case "PROCEED_LATER":
      return { status: "DEFERRED", nextStep: null };
  }
}

/** 숙려 화면의 선택지인가 — 제안 단계에서 바로 눌릴 수 있는 버튼이 아니다 */
export function isDeliberationAction(action: BranchDecision["action"]): boolean {
  return action === "PROCEED_TODAY" || action === "PROCEED_LATER";
}
