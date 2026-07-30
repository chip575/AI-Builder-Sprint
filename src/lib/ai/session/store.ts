// 세션 파사드 — 기존 인터페이스를 유지하고 구현은 StorePort 뒤로 (D-18).
// 인메모리/Supabase 선택·DATA_MODE 로그는 lib/store가 한다.
import type { BranchOrigin, BranchType } from "../../contracts/common";
import type { IntentFact } from "../../contracts/extract";
import { store } from "../../store";

export type {
  BranchProposalRecord,
  SessionRecord,
  Utterance,
} from "../../store/types";

export const getOrCreateSession = (sessionId?: string | null, userId?: string) =>
  store.getOrCreateSession(sessionId, userId);

export const getSession = (sessionId: string) => store.getSession(sessionId);

export const addUtterance = (sessionId: string, text: string) =>
  store.addUtterance(sessionId, text);

export const addProposal = (
  sessionId: string,
  branchType: BranchType,
  origin: BranchOrigin,
  sourceUtteranceId: string,
) => store.addProposal(sessionId, branchType, origin, sourceUtteranceId);

/** UPSERT — confirmed=true 행은 덮지 않는다 (P1). 반환은 방어 적용 후의 유효 facts */
export const saveFacts = (sessionId: string, facts: IntentFact[]) =>
  store.saveFacts(sessionId, facts);

export const findFact = (factId: string) => store.findFact(factId);

export const patchFactValue = (factId: string, value: IntentFact["value"]) =>
  store.patchFactValue(factId, value);

export const confirmFacts = (sessionId: string) => store.confirmFacts(sessionId);
