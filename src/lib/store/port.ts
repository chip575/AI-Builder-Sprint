// StorePort — 영속화 어댑터 경계 (D-18). 인메모리·Supabase가 같은 규칙을 구현한다.
// "같은 규칙"의 증명은 문서가 아니라 store-contract.ts 공유 스위트다 — 한 스위트, 두 구현.
import type { BranchOrigin, BranchType, DocStatus, DocType } from "../contracts/common";
import type { IntentFact } from "../contracts/extract";
import type { GateVerdict } from "../contracts/gate";
import type { LedgerNode } from "../contracts/ledger";
import type {
  BranchProposalRecord,
  GateStats,
  GateVerdictRecord,
  LedgerAppendInput,
  MetricRecord,
  StageStat,
  DraftRecord,
  EvidenceRecord,
  SessionRecord,
  Utterance,
  WebhookEventInput,
  WebhookEventRecord,
} from "./types";

export interface StorePort {
  // ── 세션(intent) ──────────────────────────────────────────
  getOrCreateSession(sessionId?: string | null, userId?: string): Promise<SessionRecord>;
  getSession(sessionId: string): Promise<SessionRecord | undefined>;
  addUtterance(sessionId: string, text: string): Promise<Utterance>;
  /** 원문 수정 API는 존재하지 않는다 (FR-111). 삭제는 단방향 소프트 삭제만 —
   *  이미 삭제된 발화면 false (번복·재삭제 불가, D-10) */
  softDeleteUtterance(utteranceId: string): Promise<boolean>;
  addProposal(
    sessionId: string,
    branchType: BranchType,
    origin: BranchOrigin,
    sourceUtteranceId: string,
  ): Promise<BranchProposalRecord>;

  // ── facts ─────────────────────────────────────────────────
  /** UPSERT (intent_id, key) — 단, confirmed=true 행은 덮지 않는다 (P1의 DB 방어).
   *  확정값 변경은 patchFactValue(사용자 행위)만. 반환은 방어 적용 후의 유효 facts */
  saveFacts(sessionId: string, facts: IntentFact[]): Promise<IntentFact[]>;
  findFact(
    factId: string,
  ): Promise<{ session: SessionRecord; fact: IntentFact } | undefined>;
  /** 사용자 편집 — confidence=1, confirmed=false(재확정 필요)로 갱신 */
  patchFactValue(
    factId: string,
    value: IntentFact["value"],
  ): Promise<IntentFact | undefined>;
  /** 전체 일괄 확정 — 확정 경로는 이것뿐 (FR-103). 이번에 확정된 수 반환 */
  confirmFacts(sessionId: string): Promise<number>;

  // ── drafts ────────────────────────────────────────────────
  createDraft(
    intentId: string,
    docType: DocType,
    verdict: GateVerdict,
  ): Promise<DraftRecord>;
  getDraft(draftId: string): Promise<DraftRecord | undefined>;
  /** 웹훅 역참조 — 모두싸인 문서 ID로 draft를 찾는다 (02.3 §1) */
  findDraftByDocumentId(modusignDocumentId: string): Promise<DraftRecord | undefined>;
  markDraftRequested(draftId: string, modusignDocumentId: string): Promise<void>;
  syncDraftStatus(
    draftId: string,
    status: DocStatus,
    rejectReason?: string | null,
  ): Promise<void>;

  // ── webhook events (아웃박스) ─────────────────────────────
  /** ON CONFLICT DO NOTHING — 중복이면 버린다(멱등). facts의 DO UPDATE와
   *  구문은 쌍둥이지만 의도는 정반대다: 여기서 중복은 노이즈, 거기서 중복은 정정.
   *  하나를 보고 다른 하나를 "통일"하지 말 것. */
  insertWebhookEvent(input: WebhookEventInput): Promise<"INSERTED" | "DUPLICATE">;
  listUnprocessedEvents(): Promise<WebhookEventRecord[]>;
  markEventProcessed(id: number): Promise<void>;

  // ── gate verdicts (FR-509 · NFR-709) ──────────────────────
  /** 판정 이력 기록. 3분기 전부 남긴다 — 분포 화면의 근거.
   *  ⚠ 기록 실패가 본 흐름을 막으면 안 된다 — 호출부가 삼킨다 (관측이 기능을 죽이지 않는다) */
  recordGateVerdict(input: GateVerdictRecord): Promise<void>;
  getGateStats(): Promise<GateStats>;

  // ── pipeline metrics (NFR-709) ────────────────────────────
  /** 적재 실패가 본 흐름을 막으면 안 된다 — 호출부가 삼킨다 */
  recordMetric(input: MetricRecord): Promise<void>;
  getPipelineStats(): Promise<StageStat[]>;

  // ── reconciler (FR-504) ───────────────────────────────────
  /** 진행 중인데 오래 갱신되지 않은 draft — 웹훅 유실 후보 */
  listStaleRequestedDrafts(olderThanMs: number): Promise<DraftRecord[]>;
  recordReconcile(corrected: number): Promise<void>;
  getReconcileState(): Promise<{ lastSyncAt: string | null; correctedTotal: number }>;

  // ── mock signer 외부 상태 (MODUSIGN_MODE=mock 전용) ───────
  /** 서버리스는 요청마다 인스턴스가 갈린다. mock이 대역하는 "외부 세계"를 인메모리로만
   *  두면 서명 요청은 A에서, 완료 시뮬은 B에서 처리되어 문서를 잃는다.
   *  ⚠ **draft와 분리된 자리**여야 한다 — 같은 자리에 쓰면 우리 기록이 함께 움직여
   *  "웹훅 유실"(외부만 완료, 우리는 REQUESTED)을 재현할 수 없다. */
  putMockDoc(documentId: string, state: Record<string, unknown>): Promise<void>;
  getMockDoc(documentId: string): Promise<Record<string, unknown> | undefined>;

  // ── intent ledger (FR-550~555) ────────────────────────────
  /** append-only. UPDATE·DELETE는 존재하지 않는다 — 정정도 새 노드다.
   *  seq와 해시는 어댑터가 꼬리를 읽어 계산한다 (lib/ledger/chain.buildNode) */
  appendLedgerNode(input: LedgerAppendInput): Promise<LedgerNode>;
  /** seq 오름차순. status는 저장값이 아니라 유도값으로 내보낸다 (FR-555 최신성) */
  listLedgerNodes(subjectId: string): Promise<LedgerNode[]>;

  // ── evidences ─────────────────────────────────────────────
  createEvidence(
    input: Omit<EvidenceRecord, "id" | "createdAt">,
  ): Promise<EvidenceRecord>;
  getEvidenceByDraft(draftId: string): Promise<EvidenceRecord | undefined>;
}
