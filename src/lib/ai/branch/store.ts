// 가지 제안의 **결정 상태** 보관 (FR-115A)
//
// ⚠ 왜 StorePort가 아닌가 — `branch_proposals`에는 상태 컬럼이 없다(0001).
//    제안 자체는 StorePort.addProposal이 그대로 적재하고, 여기서는 그 위에
//    결정(수락·거절·보류)만 얹는다. 컬럼과 StorePort 메서드가 생기면 이 파일의
//    구현부만 교체된다 — 호출부(propose.ts·decide 라우트)는 이 인터페이스만 안다.
// ⚠ 현 구현은 프로세스 국소다. 서버리스에서 인스턴스가 갈리면 결정 이력이 갈린다 —
//    "거부 이력 영구 보존"의 완성은 스키마 이관 뒤다 (docs/ai-log.md 인계 항목).
import type { BranchType } from "../../contracts/common";
import type { BranchProposal } from "../../contracts/branch";

/** PROPOSED = 아직 사용자가 답하지 않은 제안. 나머지는 BranchDecisionRes.status와 같다 */
export type ProposalStatus =
  | "PROPOSED"
  | "OPENED"
  | "PENDING_RECONFIRM"
  | "DECLINED"
  | "DEFERRED";

export interface ProposalRecord extends BranchProposal {
  sessionId: string;
  /** 거부 이력은 사람 단위다 — 다른 세션에서 되살아나면 "닫았다"는 말이 무의미해진다 */
  userId: string;
  status: ProposalStatus;
  decidedAt: string | null;
}

const g = globalThis as unknown as { __namgidaProposals?: Map<string, ProposalRecord> };
const records = (g.__namgidaProposals ??= new Map<string, ProposalRecord>());

export function rememberProposal(
  proposal: BranchProposal,
  sessionId: string,
  userId: string,
): ProposalRecord {
  const record: ProposalRecord = {
    ...proposal,
    sessionId,
    userId,
    status: "PROPOSED",
    decidedAt: null,
  };
  records.set(record.id, record);
  return record;
}

export function getProposalRecord(id: string): ProposalRecord | undefined {
  return records.get(id);
}

export function setProposalStatus(
  id: string,
  status: Exclude<ProposalStatus, "PROPOSED">,
  decidedAt: string,
): ProposalRecord | undefined {
  const record = records.get(id);
  if (!record) return undefined;
  record.status = status;
  record.decidedAt = decidedAt;
  return record;
}

/** 이 사람이 닫은 가지들 — 다시 제안하지 않는다 (FR-115A) */
export function declinedBranchTypes(userId: string): Set<BranchType> {
  const closed = new Set<BranchType>();
  for (const r of records.values()) {
    if (r.userId === userId && r.status === "DECLINED") closed.add(r.branchType);
  }
  return closed;
}

/** 이 세션에서 이미 꺼낸 가지들 — 같은 말을 두 번 묻는 것도 독촉이다 (FR-113) */
export function proposedBranchTypes(sessionId: string): Set<BranchType> {
  const seen = new Set<BranchType>();
  for (const r of records.values()) {
    if (r.sessionId === sessionId) seen.add(r.branchType);
  }
  return seen;
}
