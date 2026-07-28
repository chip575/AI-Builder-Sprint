// M-SESSION-MSG — 인메모리 세션 저장소.
// M0 관통용. Supabase 영속화가 붙으면 이 모듈의 인터페이스는 유지되고 구현만 바뀐다.
import { randomUUID } from "node:crypto";
import type { BranchOrigin, BranchType } from "../../contracts/common";
import type { IntentFact } from "../../contracts/extract";

export interface Utterance {
  id: string;
  text: string;
  at: string; // ISO
}

export interface BranchProposalRecord {
  id: string;
  branchType: BranchType;
  origin: BranchOrigin; // 분석·감사용 기록 (FR-115B)
  sourceUtteranceId: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  utterances: Utterance[];
  proposals: BranchProposalRecord[];
  /** M-EXTRACT 결과 — 재추출 시 교체. 확정(confirmed)은 M-FACTS-CONFIRM이 갱신 */
  facts: IntentFact[];
  startedAt: string;
}

const sessions = new Map<string, SessionRecord>();

/** 조회 전용 — 없으면 undefined (extract·facts 라우트는 세션을 만들지 않는다) */
export function getSession(sessionId: string): SessionRecord | undefined {
  return sessions.get(sessionId);
}

export function getOrCreateSession(sessionId?: string | null): SessionRecord {
  if (sessionId) {
    const found = sessions.get(sessionId);
    if (found) return found;
  }
  const record: SessionRecord = {
    id: sessionId ?? randomUUID(),
    utterances: [],
    proposals: [],
    facts: [],
    startedAt: new Date().toISOString(),
  };
  sessions.set(record.id, record);
  return record;
}

export function addUtterance(session: SessionRecord, text: string): Utterance {
  const u: Utterance = { id: randomUUID(), text, at: new Date().toISOString() };
  session.utterances.push(u);
  return u;
}

export function addProposal(
  session: SessionRecord,
  branchType: BranchType,
  origin: BranchOrigin,
  sourceUtteranceId: string,
): BranchProposalRecord {
  const p: BranchProposalRecord = {
    id: randomUUID(),
    branchType,
    origin,
    sourceUtteranceId,
    createdAt: new Date().toISOString(),
  };
  session.proposals.push(p);
  return p;
}
