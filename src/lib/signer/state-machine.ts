// 문서 상태 머신 — mock signer(외부 세계 시뮬)와 웹훅 아웃박스(우리 쪽 동기화)가
// 같은 표를 공유한다. 두 벌이 되는 순간 "역행 방지"가 한쪽에서만 참이 된다.
import type { DocStatus } from "../contracts/common";

/** 허용 전이 표 — 여기 없는 전이는 무시(스킵+로그)된다 (02.3 §3 역행 방지) */
export const ALLOWED_TRANSITIONS: Record<DocStatus, DocStatus[]> = {
  DRAFT: ["REQUESTED"],
  REQUESTED: ["COMPLETED", "REJECTED", "CANCELED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELED: [],
};

/**
 * 모두싸인 웹훅 이벤트명 → 우리 상태.
 * 근거: https://developers.modusign.co.kr/reference/usercontroller_createwebhook.md
 *       (2026-07-30 확인 — 구독 가능 이벤트 10종)
 * ⚠ mock도 이 이름을 쓴다. mock이 현실과 다른 이름을 쓰면 real 전환에서 그대로 터진다.
 *   (실제로 우리는 존재하지 않는 document_completed를 쓰고 있었다)
 */
export const EVENT_TO_STATUS: Record<string, DocStatus> = {
  document_started: "REQUESTED",
  // document_signed는 "마지막 서명자 제외"라 완료가 아니다 — 상태를 옮기지 않는다
  document_all_signed: "COMPLETED",
  document_rejected: "REJECTED",
  document_request_canceled: "CANCELED",
  document_signing_canceled: "CANCELED",
};

/**
 * 모두싸인 문서 status → 우리 DocStatus.
 * 근거: https://developers.modusign.co.kr/reference/documentcontroller_getdocument.md
 *       (2026-07-30 확인 — DRAFT·SCHEDULED·ON_GOING·MODIFYING·APPROVAL_PENDING·
 *        ON_PROCESSING·PROCESSING_FAILED·ABORTED·COMPLETED)
 * ABORTED는 abort.type으로 갈린다 — REJECTION이면 거절, 나머지는 취소.
 */
export function mapModusignStatus(
  status: string,
  abortType?: string | null,
): DocStatus | null {
  switch (status) {
    case "DRAFT":
    case "SCHEDULED":
      return "DRAFT";
    case "ON_GOING":
    case "MODIFYING":
    case "APPROVAL_PENDING":
    case "ON_PROCESSING":
      return "REQUESTED";
    case "COMPLETED":
      return "COMPLETED";
    case "ABORTED":
      return abortType === "REJECTION" ? "REJECTED" : "CANCELED";
    // PROCESSING_FAILED — 외부 처리 실패. 우리 상태를 옮기지 않고 리컨실러가 재확인한다
    default:
      return null;
  }
}

export function canTransition(from: DocStatus, to: DocStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
