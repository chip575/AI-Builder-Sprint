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

/** 외부 이벤트명 → 목표 상태 */
export const EVENT_TO_STATUS: Record<string, DocStatus> = {
  document_requested: "REQUESTED",
  document_completed: "COMPLETED",
  document_rejected: "REJECTED",
  document_canceled: "CANCELED",
};

export function canTransition(from: DocStatus, to: DocStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
