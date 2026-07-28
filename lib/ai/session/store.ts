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
  /** 최근 추출 시점의 필수 슬롯 공백 — confirm·문서 생성 차단 근거 (FR-102) */
  missingRequired: string[];
  startedAt: string;
}

// globalThis 캐싱 — Next가 라우트를 다른 청크로 번들해도 인스턴스가 갈라지지 않게.
// (dev 실측은 통과했지만 보장된 동작이 아니다. 영속화(Supabase)가 붙으면 제거)
const g = globalThis as unknown as { __namgidaSessions?: Map<string, SessionRecord> };
const sessions = (g.__namgidaSessions ??= new Map<string, SessionRecord>());

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
    missingRequired: [],
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

/** factId로 세션 전체에서 fact와 소속 세션을 찾는다 (M-FACTS-CONFIRM용) */
export function findFact(
  factId: string,
): { session: SessionRecord; fact: IntentFact } | undefined {
  for (const session of sessions.values()) {
    const fact = session.facts.find((f) => f.id === factId);
    if (fact) return { session, fact };
  }
  return undefined;
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
