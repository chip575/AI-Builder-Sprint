// 인메모리 StorePort — mock·테스트·키 없는 채점 경로(NFR-707)의 기본 구현.
// DB 트리거 전체를 흉내내지 않는다 — store-contract 스위트가 요구하는 규칙만 구현한다.
import { randomUUID } from "node:crypto";
import { cosine } from "../ai/embed/port";
import type { Obligation, ObligationKind } from "../contracts/obligations";
import type { BranchOrigin, BranchType, DocStatus, DocType } from "../contracts/common";
import type { Asset, Beneficiary } from "../contracts/estate";
import type { IntentFact } from "../contracts/extract";
import type { GateVerdict } from "../contracts/gate";
import type { LedgerNode } from "../contracts/ledger";
import { buildNode, withDerivedStatus } from "../ledger/chain";
import { maskIdentifier } from "./mask";
import type { StorePort } from "./port";
import { summarizeMetrics } from "./percentile";
import {
  DEV_USER_ID,
  type AssetWriteInput,
  type BeneficiaryWriteInput,
  type BranchProposalRecord,
  type DraftRecord,
  type EvidenceRecord,
  type FamilyAckRecord,
  type FamilyAckTarget,
  type HeartWillApplyResult,
  type HeartWillParagraph,
  type HeartWillParagraphDraft,
  type HeartWillVersion,
  type LedgerAppendInput,
  type SessionRecord,
  type Utterance,
  type GateStats,
  type GateVerdictRecord,
  type MetricRecord,
  type StageStat,
  type WebhookEventInput,
  type WebhookEventRecord,
} from "./types";

interface MemUtterance extends Utterance {
  deletedAt: string | null;
}

interface MemSession extends Omit<SessionRecord, "utterances"> {
  utterances: MemUtterance[];
}

interface MemHeartWillVersion {
  id: string;
  prevVersionId: string | null;
  createdAt: string;
  paragraphs: HeartWillParagraph[];
}

/** intent당 문서 1건. versions는 선형 체인이고 마지막 원소가 현재 버전이다 */
interface MemHeartWill {
  documentId: string;
  versions: MemHeartWillVersion[];
}

export class InMemoryStore implements StorePort {
  private sessions = new Map<string, MemSession>();
  private drafts = new Map<string, DraftRecord>();
  private events = new Map<string, WebhookEventRecord>(); // key = externalEventId (UNIQUE의 인메모리판)
  private evidences = new Map<string, EvidenceRecord>();  // key = draftId
  private eventSeq = 0;
  /** fact 갱신 이력 — Supabase에선 audit_logs. 스위트 검증 대상 아님, 디버깅용 */
  public auditTrail: { action: string; subject: string; at: string }[] = [];

  private view(s: MemSession): SessionRecord {
    return { ...s, utterances: s.utterances.filter((u) => u.deletedAt === null) };
  }

  async getOrCreateSession(sessionId?: string | null, userId = DEV_USER_ID): Promise<SessionRecord> {
    if (sessionId) {
      const found = this.sessions.get(sessionId);
      if (found) return this.view(found);
    }
    const record: MemSession = {
      id: sessionId ?? randomUUID(),
      userId,
      utterances: [],
      proposals: [],
      facts: [],
      confirmedAt: null,
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(record.id, record);
    return this.view(record);
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    const s = this.sessions.get(sessionId);
    return s ? this.view(s) : undefined;
  }

  async addUtterance(sessionId: string, text: string): Promise<Utterance> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`unknown session: ${sessionId}`);
    const u: MemUtterance = {
      id: randomUUID(),
      text,
      at: new Date().toISOString(),
      deletedAt: null,
    };
    s.utterances.push(u);
    return u;
  }

  async softDeleteUtterance(utteranceId: string): Promise<boolean> {
    for (const s of this.sessions.values()) {
      const u = s.utterances.find((x) => x.id === utteranceId);
      if (u) {
        if (u.deletedAt !== null) return false; // 단방향 — 재삭제·번복 불가 (D-10)
        u.deletedAt = new Date().toISOString();
        this.auditTrail.push({ action: "utterance.softDelete", subject: utteranceId, at: u.deletedAt });
        return true;
      }
    }
    return false;
  }

  async addProposal(
    sessionId: string,
    branchType: BranchType,
    origin: BranchOrigin,
    sourceUtteranceId: string,
  ): Promise<BranchProposalRecord> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`unknown session: ${sessionId}`);
    const p: BranchProposalRecord = {
      id: randomUUID(),
      branchType,
      origin,
      sourceUtteranceId,
      status: "PROPOSED",
      decidedAt: null,
      createdAt: new Date().toISOString(),
    };
    s.proposals.push(p);
    return { ...p };
  }

  async decideProposal(
    proposalId: string,
    status: "OPENED" | "PENDING_RECONFIRM" | "DECLINED" | "DEFERRED",
  ): Promise<BranchProposalRecord | undefined> {
    for (const s of this.sessions.values()) {
      const p = s.proposals.find((x) => x.id === proposalId);
      if (!p) continue;
      p.status = status;
      p.decidedAt = new Date().toISOString();
      return { ...p };
    }
    return undefined;
  }

  async listDeclinedBranches(sessionId: string): Promise<BranchType[]> {
    const s = this.sessions.get(sessionId);
    if (!s) return [];
    return [...new Set(s.proposals.filter((p) => p.status === "DECLINED").map((p) => p.branchType))];
  }

  async saveFacts(sessionId: string, facts: IntentFact[]): Promise<IntentFact[]> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`unknown session: ${sessionId}`);
    const byKey = new Map(s.facts.map((f) => [f.key, f]));
    for (const incoming of facts) {
      const existing = byKey.get(incoming.key);
      if (existing?.confirmed) continue; // DO UPDATE ... WHERE confirmed=false의 인메모리판 (P1)
      byKey.set(incoming.key, existing ? { ...incoming, id: existing.id } : incoming);
      s.confirmedAt = null; // 새 값이 들어오면 확정 무효
      this.auditTrail.push({ action: "fact.upsert", subject: incoming.key, at: new Date().toISOString() });
    }
    s.facts = [...byKey.values()];
    return s.facts;
  }

  async findFact(factId: string) {
    for (const s of this.sessions.values()) {
      const fact = s.facts.find((f) => f.id === factId);
      if (fact) return { session: this.view(s), fact };
    }
    return undefined;
  }

  async patchFactValue(factId: string, value: IntentFact["value"]) {
    const found = await this.findFact(factId);
    if (!found) return undefined;
    const s = this.sessions.get(found.session.id)!;
    const fact = s.facts.find((f) => f.id === factId)!;
    fact.value = value;
    fact.confidence = 1;      // 사용자가 직접 준 값
    fact.confirmed = false;   // 값이 바뀌면 확정 무효 — 재확정 필요 (P1)
    s.confirmedAt = null;
    this.auditTrail.push({ action: "fact.patch", subject: factId, at: new Date().toISOString() });
    return fact;
  }

  async confirmFacts(sessionId: string): Promise<number> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`unknown session: ${sessionId}`);
    let n = 0;
    for (const f of s.facts) {
      if (!f.confirmed) n += 1;
      f.confirmed = true;
    }
    s.confirmedAt = new Date().toISOString();
    return n;
  }

  async createDraft(
    intentId: string,
    docType: DocType,
    verdict: GateVerdict,
  ): Promise<DraftRecord> {
    const draftId = randomUUID();
    const draft: DraftRecord = {
      draftId,
      intentId,
      docType,
      verdict,
      pdfUrl: `https://mock.namgida.local/drafts/${draftId}.pdf`,
      status: "DRAFT",
      modusignDocumentId: null,
      rejectReason: null,
      createdAt: new Date().toISOString(),
    };
    this.drafts.set(draftId, draft);
    return draft;
  }

  async getDraft(draftId: string) {
    return this.drafts.get(draftId);
  }

  async findDraftByDocumentId(modusignDocumentId: string) {
    for (const d of this.drafts.values()) {
      if (d.modusignDocumentId === modusignDocumentId) return d;
    }
    return undefined;
  }

  async markDraftRequested(draftId: string, modusignDocumentId: string) {
    const d = this.drafts.get(draftId);
    if (!d) throw new Error(`unknown draft: ${draftId}`);
    d.modusignDocumentId = modusignDocumentId;
    d.status = "REQUESTED";
  }

  async syncDraftStatus(draftId: string, status: DocStatus, rejectReason?: string | null) {
    const d = this.drafts.get(draftId);
    if (!d) throw new Error(`unknown draft: ${draftId}`);
    d.status = status;
    if (rejectReason !== undefined) d.rejectReason = rejectReason;
  }

  async insertWebhookEvent(input: WebhookEventInput): Promise<"INSERTED" | "DUPLICATE"> {
    // ON CONFLICT DO NOTHING의 인메모리판 — 중복은 버린다 (facts UPSERT와 의도 정반대)
    if (this.events.has(input.externalEventId)) return "DUPLICATE";
    this.events.set(input.externalEventId, {
      ...input,
      id: ++this.eventSeq,
      receivedAt: new Date().toISOString(),
      processedAt: null,
    });
    return "INSERTED";
  }

  async listUnprocessedEvents(): Promise<WebhookEventRecord[]> {
    return [...this.events.values()]
      .filter((e) => e.processedAt === null)
      .sort((a, b) => a.id - b.id);
  }

  async markEventProcessed(id: number) {
    for (const e of this.events.values()) {
      if (e.id === id) e.processedAt = new Date().toISOString();
    }
  }

  private gateVerdicts: GateVerdictRecord[] = [];

  async recordGateVerdict(input: GateVerdictRecord): Promise<void> {
    this.gateVerdicts.push(input);
  }

  async getGateStats(): Promise<GateStats> {
    const byDocType: Record<string, number> = {};
    const statute = new Map<string, number>();
    const byVerdict: Record<string, number> = {};
    let blockedTotal = 0;

    for (const v of this.gateVerdicts) {
      byVerdict[v.verdict] = (byVerdict[v.verdict] ?? 0) + 1;
      // 차단 = 무효 판정인데 서명 경로로 가려던 것만 (FR-509)
      if (v.verdict !== "ESIGN_INVALID" || !v.wasSignAttempt) continue;
      blockedTotal += 1;
      byDocType[v.docType] = (byDocType[v.docType] ?? 0) + 1;
      for (const st of v.statutes) statute.set(st.id, (statute.get(st.id) ?? 0) + 1);
    }
    return {
      blockedTotal,
      byDocType,
      byStatute: [...statute].map(([id, count]) => ({ id, count })),
      byVerdict,
      totalEvaluations: this.gateVerdicts.length,
    };
  }

  private metrics: MetricRecord[] = [];

  async recordMetric(input: MetricRecord): Promise<void> {
    this.metrics.push(input);
  }

  async getPipelineStats(): Promise<StageStat[]> {
    return summarizeMetrics(this.metrics);
  }

  private reconciles: { at: string; corrected: number }[] = [];

  async listStaleRequestedDrafts(olderThanMs: number): Promise<DraftRecord[]> {
    const cutoff = Date.now() - olderThanMs;
    return [...this.drafts.values()].filter(
      (d) => d.status === "REQUESTED" && new Date(d.createdAt).getTime() <= cutoff,
    );
  }

  async recordReconcile(corrected: number): Promise<void> {
    this.reconciles.push({ at: new Date().toISOString(), corrected });
  }

  async getReconcileState() {
    return {
      lastSyncAt: this.reconciles.at(-1)?.at ?? null,
      correctedTotal: this.reconciles.reduce((n, r) => n + r.corrected, 0),
    };
  }

  private audits: { action: string; subject: string; detail?: unknown; at: string }[] = [];

  async recordAudit(action: string, subject: string, detail?: unknown): Promise<void> {
    this.audits.push({ action, subject, detail, at: new Date().toISOString() });
  }

  async getAuditSummary(action: string, subject: string) {
    const rows = this.audits.filter((a) => a.action === action && a.subject === subject);
    return { count: rows.length, lastAt: rows.at(-1)?.at ?? null };
  }

  private mockDocs = new Map<string, Record<string, unknown>>();

  async putMockDoc(documentId: string, state: Record<string, unknown>): Promise<void> {
    this.mockDocs.set(documentId, state);
  }

  async getMockDoc(documentId: string) {
    return this.mockDocs.get(documentId);
  }

  private heartWills = new Map<string, MemHeartWill>(); // key = intentId

  /** 방어 복사로 내보낸다 — 호출부가 들고 있는 배열이 저장소를 바꾸면 안 된다 */
  private heartWillView(hw: MemHeartWill): HeartWillVersion {
    const head = hw.versions.at(-1)!;
    return {
      versionId: head.id,
      documentId: hw.documentId,
      prevVersionId: head.prevVersionId,
      paragraphs: head.paragraphs.map((p) => ({ ...p })),
      createdAt: head.createdAt,
    };
  }

  async draftHeartWillParagraphs(
    sessionId: string,
    drafts: HeartWillParagraphDraft[],
  ): Promise<HeartWillVersion> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`unknown session: ${sessionId}`);

    // 전량 검사 후 전량 적재 — 하나가 근거 없으면 아무것도 쌓이지 않는다.
    // 부분 적재를 허용하면 "근거 없는 문단은 만들 수 없다"가 순서 의존 규칙이 된다.
    const alive = new Set(
      s.utterances.filter((u) => u.deletedAt === null).map((u) => u.id),
    );
    for (const d of drafts) {
      if (!d.sourceUtteranceId || !alive.has(d.sourceUtteranceId)) {
        throw new Error("[store] 근거 발화 없는 문단은 만들 수 없다 (FR-111)");
      }
      if (d.body.trim() === "") throw new Error("[store] 빈 문단은 만들 수 없다");
    }

    const now = new Date().toISOString();
    let hw = this.heartWills.get(sessionId);
    if (!hw) {
      hw = {
        documentId: randomUUID(),
        versions: [{ id: randomUUID(), prevVersionId: null, createdAt: now, paragraphs: [] }],
      };
      this.heartWills.set(sessionId, hw);
    }
    const head = hw.versions.at(-1)!;
    for (const d of drafts) {
      head.paragraphs.push({
        id: randomUUID(),
        ord: head.paragraphs.length,
        body: d.body,
        origin: d.origin,
        sourceUtteranceId: d.sourceUtteranceId,
        acceptedAt: null, // 기본은 미승인 (P1)
        createdAt: now,
      });
    }
    return this.heartWillView(hw);
  }

  async getHeartWillHead(sessionId: string): Promise<HeartWillVersion | undefined> {
    const hw = this.heartWills.get(sessionId);
    return hw ? this.heartWillView(hw) : undefined;
  }

  async applyHeartWill(
    sessionId: string,
    acceptedParagraphIds: string[],
  ): Promise<HeartWillApplyResult | null> {
    const hw = this.heartWills.get(sessionId);
    if (!hw) return null;
    const head = hw.versions.at(-1)!;
    const wanted = new Set(acceptedParagraphIds);

    const previous = head.paragraphs.filter((p) => p.acceptedAt !== null);
    const accepted = head.paragraphs.filter((p) => p.acceptedAt === null && wanted.has(p.id));
    // 승인이 없으면 버전을 만들지 않는다. 빈 배열은 "전부 승인"이 아니라 "갱신 없음"이다 (P1)
    if (accepted.length === 0) return null;
    const stillPending = head.paragraphs.filter(
      (p) => p.acceptedAt === null && !wanted.has(p.id),
    );

    const at = new Date().toISOString();
    // 같은 발화를 근거로 새 문단이 승인되면 옛 문단은 그것으로 대체된다(=수정).
    // 대체되지 않은 본문은 그대로 이어진다 — 승인은 더하기지 지우기가 아니다.
    const claimed = new Set(accepted.map((p) => p.sourceUtteranceId));
    const carried = previous.filter((p) => !claimed.has(p.sourceUtteranceId));
    const body = [...carried, ...accepted].map((p, i) => ({
      ...p,
      id: randomUUID(), // 버전마다 새 행 — 문단 id는 버전 안에서만 유효하다
      ord: i,
      acceptedAt: at,
      createdAt: at,
    }));
    // 승인하지 않은 초안은 버리지 않고 다음 버전으로 옮긴다 — 사용자가 아직 정하지 않았을 뿐이다
    const pending = stillPending.map((p, i) => ({
      ...p,
      id: randomUUID(),
      ord: body.length + i,
      createdAt: at,
    }));

    hw.versions.push({
      id: randomUUID(),
      prevVersionId: head.id,
      createdAt: at,
      paragraphs: [...body, ...pending],
    });
    return {
      version: this.heartWillView(hw),
      previousParagraphs: previous.map((p) => ({ ...p })),
    };
  }

  /** key = subjectId. 배열은 push만 한다 — 인메모리에서도 append-only는 규칙이다 */
  private ledger = new Map<string, LedgerNode[]>();

  async appendLedgerNode(input: LedgerAppendInput): Promise<LedgerNode> {
    const chain = this.ledger.get(input.subjectId) ?? [];
    const node = buildNode(chain.at(-1), input, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    chain.push(node);
    this.ledger.set(input.subjectId, chain);
    return node;
  }

  async listLedgerNodes(subjectId: string): Promise<LedgerNode[]> {
    return withDerivedStatus(this.ledger.get(subjectId) ?? []);
  }

  async getLedgerNode(nodeId: string): Promise<LedgerNode | undefined> {
    for (const chain of this.ledger.values()) {
      const found = chain.find((n) => n.id === nodeId);
      // 상태는 저장값이 아니라 유도값이다 — 목록과 같은 규칙으로 내보낸다 (FR-555)
      if (found) return withDerivedStatus(chain).find((n) => n.id === nodeId);
    }
    return undefined;
  }

  /** key = utteranceId. 인메모리는 pgvector가 없으니 코사인을 직접 센다 —
   *  같은 순위가 나와야 두 구현이 하나의 계약을 지킨다 */
  private embeddings = new Map<string, { intentId: string; vector: number[] }>();

  async saveEmbeddings(
    intentId: string,
    rows: { utteranceId: string; vector: number[] }[],
  ): Promise<number> {
    let saved = 0;
    for (const r of rows) {
      if (this.embeddings.has(r.utteranceId)) continue; // 재적재하지 않는다
      this.embeddings.set(r.utteranceId, { intentId, vector: [...r.vector] });
      saved += 1;
    }
    return saved;
  }

  async listUnembeddedUtterances(intentId: string) {
    const session = this.sessions.get(intentId);
    if (!session) return [];
    return session.utterances
      .filter((u) => u.deletedAt === null && !this.embeddings.has(u.id))
      .map((u) => ({ utteranceId: u.id, text: u.text }));
  }

  async searchSimilarUtterances(intentId: string, queryVector: number[], k: number) {
    const session = this.sessions.get(intentId);
    if (!session) return [];
    const scored = [];
    for (const u of session.utterances) {
      // 지운 이야기는 검색으로 되살아나지 않는다 (D-10)
      if (u.deletedAt !== null) continue;
      const e = this.embeddings.get(u.id);
      if (!e) continue;
      scored.push({
        utteranceId: u.id,
        sessionId: intentId,
        text: u.text,
        spokenAt: u.at,
        score: cosine(queryVector, e.vector),
      });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  }

  async countDraftsByStatus(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const d of this.drafts.values()) {
      out[d.status] = (out[d.status] ?? 0) + 1;
    }
    return out;
  }

  private obligations: Obligation[] = [];

  async createObligation(input: {
    kind: ObligationKind;
    subjectId: string;
    dueAt: string;
  }): Promise<Obligation | undefined> {
    // 중복 방지 — 같은 대상의 같은 종류가 아직 발화 전이면 새로 만들지 않는다
    const pending = this.obligations.find(
      (o) => o.kind === input.kind && o.subjectId === input.subjectId && !o.firedAt,
    );
    if (pending) return undefined;
    const created: Obligation = {
      id: randomUUID(),
      kind: input.kind,
      subjectId: input.subjectId,
      dueAt: input.dueAt,
      firedAt: null,
    };
    this.obligations.push(created);
    return { ...created };
  }

  async listDueObligations(now: string): Promise<Obligation[]> {
    return this.obligations
      .filter((o) => !o.firedAt && o.dueAt <= now)
      .map((o) => ({ ...o }));
  }

  async markObligationFired(id: string, firedAt: string): Promise<void> {
    const o = this.obligations.find((x) => x.id === id);
    if (o) o.firedAt = firedAt;
  }

  async listObligations(subjectId?: string): Promise<Obligation[]> {
    return this.obligations
      .filter((o) => !subjectId || o.subjectId === subjectId)
      .map((o) => ({ ...o }));
  }

  async shiftObligationDueDates(months: number): Promise<number> {
    let shifted = 0;
    for (const o of this.obligations) {
      if (o.firedAt) continue;
      const d = new Date(o.dueAt);
      d.setMonth(d.getMonth() - months);
      o.dueAt = d.toISOString();
      shifted += 1;
    }
    return shifted;
  }

  private familyAcks: FamilyAckRecord[] = [];

  async requestFamilyAcks(
    ledgerNodeId: string,
    targets: (FamilyAckTarget & { documentId: string | null })[],
  ): Promise<FamilyAckRecord[]> {
    // 빈 배열이면 행을 만들지 않는다. "요청 0건"이 정상 상태다 (P4)
    const now = new Date().toISOString();
    const created = targets.map((t) => ({
      id: randomUUID(),
      ledgerNodeId,
      recipientId: t.recipientId,
      recipientName: t.recipientName ?? null,
      relation: t.relation ?? null,
      status: "PENDING" as const,
      documentId: t.documentId,
      notifiedAt: now,
      signedAt: null,
      declinedReason: null,
    }));
    this.familyAcks.push(...created);
    return created.map((a) => ({ ...a }));
  }

  async listFamilyAcks(ledgerNodeId: string): Promise<FamilyAckRecord[]> {
    return this.familyAcks
      .filter((a) => a.ledgerNodeId === ledgerNodeId)
      .map((a) => ({ ...a }));
  }

  async resolveFamilyAck(
    documentId: string,
    status: "ACKNOWLEDGED" | "DECLINED",
    declinedReason?: string | null,
  ): Promise<FamilyAckRecord | undefined> {
    const ack = this.familyAcks.find((a) => a.documentId === documentId);
    if (!ack) return undefined;
    ack.status = status;
    ack.signedAt = new Date().toISOString();
    ack.declinedReason = status === "DECLINED" ? (declinedReason ?? null) : null;
    return { ...ack };
  }

  /** 소유자와 값을 한 쌍으로 든다 — Asset 안에 userId를 섞으면 계약 밖 필드가
   *  응답으로 새어 나가는 경로가 생긴다 */
  private assets: { userId: string; asset: Asset }[] = [];
  private beneficiaries: { userId: string; beneficiary: Beneficiary }[] = [];

  async createAsset(input: AssetWriteInput): Promise<Asset> {
    const base = {
      id: randomUUID(),
      label: input.label,
      // 저장 직전 다시 마스킹한다 — 호출부가 무엇을 보내든 표에는 마스킹된 값만 남는다
      maskedIdentifier: maskIdentifier(input.maskedIdentifier),
      estimatedValueKrw: input.estimatedValueKrw ?? null,
      origin: input.origin,
      confidence: input.confidence ?? null,
      // 확인 여부는 출처가 정한다. 판독 산출물은 미확인으로 시작하고(P1),
      // 본인이 직접 쓴 값은 그 입력 자체가 확인이다
      confirmed: input.origin === "MANUAL",
      beneficiaryId: input.beneficiaryId ?? null,
      story: input.story ?? null,
      sourceUploadId: input.sourceUploadId ?? null,
    };
    const asset: Asset =
      input.category === "DIGITAL"
        ? { ...base, category: "DIGITAL", disposition: input.disposition }
        : { ...base, category: input.category };
    this.assets.push({ userId: input.userId, asset });
    return { ...asset };
  }

  async listAssets(userId: string): Promise<Asset[]> {
    return this.assets.filter((a) => a.userId === userId).map((a) => ({ ...a.asset }));
  }

  async createBeneficiary(input: BeneficiaryWriteInput): Promise<Beneficiary> {
    const beneficiary: Beneficiary = {
      id: randomUUID(),
      name: input.name,
      relation: input.relation,
      recipientId: input.recipientId ?? null,
    };
    this.beneficiaries.push({ userId: input.userId, beneficiary });
    return { ...beneficiary };
  }

  async listBeneficiaries(userId: string): Promise<Beneficiary[]> {
    return this.beneficiaries
      .filter((b) => b.userId === userId)
      .map((b) => ({ ...b.beneficiary }));
  }

  async createEvidence(input: Omit<EvidenceRecord, "id" | "createdAt">) {
    const record: EvidenceRecord = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.evidences.set(input.draftId, record);
    return record;
  }

  async getEvidenceByDraft(draftId: string) {
    return this.evidences.get(draftId);
  }
}
