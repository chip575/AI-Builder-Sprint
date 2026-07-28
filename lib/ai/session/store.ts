// M-SESSION-MSG — 인메모리 세션 저장소.
// M0 관통용. Supabase 영속화가 붙으면 이 모듈의 인터페이스는 유지되고 구현만 바뀐다.
import { randomUUID } from "node:crypto";
import type { BranchOrigin, BranchType } from "../../contracts/common";

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
  startedAt: string;
}

const sessions = new Map<string, SessionRecord>();

export function getOrCreateSession(sessionId?: string | null): SessionRecord {
  if (sessionId) {
    const found = sessions.get(sessionId);
    if (found) return found;
  }
  const record: SessionRecord = {
    id: sessionId ?? randomUUID(),
    utterances: [],
    proposals: [],
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
