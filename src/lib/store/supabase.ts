// Supabase StorePort — service role + user_id 명시 필터 (D-18).
// 컬럼(snake_case) ↔ 코드(camelCase) 번역과 명세 필드명 매핑(confirmed_by_user ↔ confirmed)은
// 전부 여기서 한다. 규칙의 진실은 store-contract 스위트 — 인메모리와 같은 스위트를 통과해야 한다.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { BranchOrigin, BranchType, DocStatus, DocType } from "../contracts/common";
import type { Asset, AssetOrigin, Beneficiary, DigitalDisposition } from "../contracts/estate";
import type { IntentFact } from "../contracts/extract";
import type { GateVerdict } from "../contracts/gate";
import type { LedgerNode, LedgerNodeStatus, Materiality } from "../contracts/ledger";
import type { Obligation, ObligationKind } from "../contracts/obligations";
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
  type HeartWillOrigin,
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

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/** timestamptz → ISO(Z) 정규화.
 *  PostgREST는 '2026-07-29T17:30:07.054+00:00'(오프셋)로 주는데 계약의
 *  z.string().datetime()은 Z 표기만 허용한다. 형식 변환은 번역 계층의 일이다 —
 *  인메모리와 Supabase가 **같은 형식**을 내보내야 계약이 하나로 유지된다. */
function iso(v: string | null | undefined): any {
  return v == null ? v : new Date(v).toISOString();
}

const toObligation = (r: Row): Obligation => ({
  id: r.id,
  kind: r.kind,
  subjectId: r.subject_id,
  dueAt: iso(r.due_at),
  firedAt: iso(r.fired_at) ?? null,
});

const toFamilyAck = (r: Row): FamilyAckRecord => ({
  id: r.id,
  ledgerNodeId: r.ledger_node_id,
  recipientId: r.recipient_id,
  recipientName: r.recipient_name,
  relation: r.relation,
  status: r.status,
  documentId: r.document_id ?? null,
  notifiedAt: iso(r.notified_at),
  signedAt: iso(r.signed_at) ?? null,
  declinedReason: r.declined_reason ?? null,
});

const toAsset = (r: Row): Asset => {
  const base = {
    id: r.id,
    label: r.label,
    maskedIdentifier: r.masked_identifier,
    // bigint·numeric은 PostgREST가 문자열로 줄 수 있다 — 계약은 number다 (형식 변환은 어댑터의 일)
    estimatedValueKrw: r.estimated_value_krw == null ? null : Number(r.estimated_value_krw),
    origin: r.origin as AssetOrigin,
    confidence: r.confidence == null ? null : Number(r.confidence),
    confirmed: r.confirmed,
    beneficiaryId: r.beneficiary_id,
    story: r.story,
    sourceUploadId: r.source_upload_id,
  };
  return r.category === "DIGITAL"
    ? { ...base, category: "DIGITAL", disposition: r.disposition as DigitalDisposition }
    : { ...base, category: r.category };
};

const toBeneficiary = (r: Row): Beneficiary => ({
  id: r.id,
  name: r.name,
  relation: r.relation,
  recipientId: r.recipient_id ?? null,
});

const toFact = (r: Row): IntentFact => ({
  id: r.id,
  key: r.key,
  value: r.value,
  confidence: Number(r.confidence),
  sourceSpan: r.source_span,
  confirmed: r.confirmed_by_user, // 스키마=명세 필드명, 코드=계약 필드명 — 번역은 어댑터가
});

const toUtterance = (r: Row): Utterance => ({
  id: r.id,
  text: r.text,
  at: iso(r.spoken_at),
  deletedAt: iso(r.deleted_at),
});

const toDraft = (r: Row): DraftRecord => ({
  draftId: r.id,
  intentId: r.intent_id,
  docType: r.doc_type as DocType,
  verdict: r.gate_verdict as GateVerdict,
  pdfUrl: `https://mock.namgida.local/drafts/${r.id}.pdf`, // 실 URL 발급은 M-EVIDENCE(15분 만료)
  status: r.status as DocStatus,
  modusignDocumentId: r.modusign_document_id,
  rejectReason: r.reject_reason,
  createdAt: iso(r.created_at),
});

const toLedgerNode = (r: Row): LedgerNode => ({
  id: r.id,
  subjectId: r.subject_id,
  seq: r.seq,
  materiality: r.materiality as Materiality,
  changeSummary: r.change_summary,
  changeReason: r.change_reason,
  conditionNote: r.condition_note,
  witness: r.witness,
  draftId: r.draft_id,
  prevHash: r.prev_hash,
  nodeHash: r.node_hash,
  status: r.status as LedgerNodeStatus,
  createdAt: iso(r.created_at),
});

export class SupabaseStore implements StorePort {
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  private async audit(action: string, subject: string, detail?: unknown) {
    await this.db.from("audit_logs").insert({
      actor: "system:store",
      action,
      subject,
      detail: detail ?? null,
    });
  }

  private fail(op: string, error: { message: string } | null): never {
    throw new Error(`[store:supabase] ${op} 실패: ${error?.message ?? "unknown"}`);
  }

  async getOrCreateSession(sessionId?: string | null, userId = DEV_USER_ID): Promise<SessionRecord> {
    if (sessionId) {
      const found = await this.getSession(sessionId);
      if (found) return found;
    }
    const id = sessionId ?? randomUUID();
    const { error } = await this.db
      .from("intents")
      .insert({ id, user_id: userId }); // NULL 금지 — 기본은 dev 상수 (0002 전제)
    if (error) this.fail("intents.insert", error);
    return (await this.getSession(id))!;
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    const { data: intent, error } = await this.db
      .from("intents").select("*").eq("id", sessionId).maybeSingle();
    if (error) this.fail("intents.select", error);
    if (!intent) return undefined;

    const [utts, props, facts] = await Promise.all([
      this.db.from("utterances").select("*")
        .eq("intent_id", sessionId).is("deleted_at", null).order("spoken_at"),
      this.db.from("branch_proposals").select("*")
        .eq("intent_id", sessionId).order("created_at"),
      this.db.from("intent_facts").select("*").eq("intent_id", sessionId),
    ]);
    if (utts.error) this.fail("utterances.select", utts.error);
    if (props.error) this.fail("proposals.select", props.error);
    if (facts.error) this.fail("facts.select", facts.error);

    return {
      id: intent.id,
      userId: intent.user_id,
      startedAt: iso(intent.started_at),
      utterances: (utts.data ?? []).map(toUtterance),
      proposals: (props.data ?? []).map(
        (r: Row): BranchProposalRecord => ({
          id: r.id,
          branchType: r.branch_type as BranchType,
          origin: r.origin as BranchOrigin,
          status: (r.status ?? "PROPOSED") as BranchProposalRecord["status"],
          decidedAt: iso(r.decided_at) ?? null,
          sourceUtteranceId: r.source_utterance_id,
          createdAt: iso(r.created_at),
        }),
      ),
      facts: (facts.data ?? []).map(toFact),
      // 파생값 — 전부 확정일 때만 최종 갱신 시각. 화면이 자체 계산하지 않게 서버가 준다
      confirmedAt:
        (facts.data ?? []).length > 0 &&
        (facts.data ?? []).every((r: Row) => r.confirmed_by_user)
          ? iso(
              (facts.data ?? [])
                .map((r: Row) => r.updated_at)
                .sort()
                .at(-1),
            )
          : null,
    };
  }

  async addUtterance(sessionId: string, text: string): Promise<Utterance> {
    const row = { id: randomUUID(), intent_id: sessionId, text };
    const { data, error } = await this.db
      .from("utterances").insert(row).select().single();
    if (error) this.fail("utterances.insert", error);
    return toUtterance(data);
  }

  async softDeleteUtterance(utteranceId: string): Promise<boolean> {
    // .is("deleted_at", null) 필터가 이미 삭제된 행을 0행 매치로 걸러낸다.
    // ⚠ 이때 "지금 삭제했다"와 "이미 삭제돼 있었다"를 구분하려면 반드시 .select()로
    //   **영향받은 행**을 받아야 한다 — 사후 재조회는 둘을 구분하지 못한다
    //   (계약 스위트가 잡은 실제 버그: 2회째 호출이 true를 반환했다).
    const { data, error } = await this.db
      .from("utterances")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", utteranceId)
      .is("deleted_at", null)
      .select("id");
    if (error || !data || data.length === 0) return false;
    await this.audit("utterance.softDelete", utteranceId);
    return true;
  }

  async addProposal(
    sessionId: string,
    branchType: BranchType,
    origin: BranchOrigin,
    sourceUtteranceId: string,
  ): Promise<BranchProposalRecord> {
    const row = {
      id: randomUUID(),
      intent_id: sessionId,
      branch_type: branchType,
      origin,
      source_utterance_id: sourceUtteranceId,
    };
    const { data, error } = await this.db
      .from("branch_proposals").insert(row).select().single();
    if (error) this.fail("proposals.insert", error);
    return {
      id: data.id,
      branchType: data.branch_type,
      origin: data.origin,
      status: data.status ?? "PROPOSED",
      decidedAt: iso(data.decided_at) ?? null,
      sourceUtteranceId: data.source_utterance_id,
      createdAt: iso(data.created_at),
    };
  }

  async decideProposal(
    proposalId: string,
    status: "OPENED" | "PENDING_RECONFIRM" | "DECLINED" | "DEFERRED",
  ): Promise<BranchProposalRecord | undefined> {
    const { data, error } = await this.db
      .from("branch_proposals")
      .update({ status, decided_at: new Date().toISOString() })
      .eq("id", proposalId)
      .select()
      .maybeSingle();
    if (error) this.fail("proposals.decide", error);
    if (!data) return undefined;
    return {
      id: data.id,
      branchType: data.branch_type,
      origin: data.origin,
      status: data.status,
      decidedAt: iso(data.decided_at) ?? null,
      sourceUtteranceId: data.source_utterance_id,
      createdAt: iso(data.created_at),
    };
  }

  async getProposal(proposalId: string) {
    const { data, error } = await this.db
      .from("branch_proposals")
      .select("*, intents!inner(id, user_id)")
      .eq("id", proposalId)
      .maybeSingle();
    if (error) this.fail("proposals.get", error);
    if (!data) return undefined;
    const r = data as Row;
    return {
      id: r.id,
      branchType: r.branch_type as BranchType,
      origin: r.origin as BranchOrigin,
      status: (r.status ?? "PROPOSED") as BranchProposalRecord["status"],
      decidedAt: iso(r.decided_at) ?? null,
      sourceUtteranceId: r.source_utterance_id,
      createdAt: iso(r.created_at),
      sessionId: r.intent_id,
      userId: r.intents.user_id,
    };
  }

  async listDeclinedBranchesByUser(userId: string): Promise<BranchType[]> {
    // 닫은 가지는 다시 제안하지 않는다 — **사람 단위**다 (FR-115A)
    const { data, error } = await this.db
      .from("branch_proposals")
      .select("branch_type, intents!inner(user_id)")
      .eq("status", "DECLINED")
      .eq("intents.user_id", userId);
    if (error) this.fail("proposals.declined", error);
    return [...new Set((data ?? []).map((r: Row) => r.branch_type as BranchType))];
  }

  async saveFacts(sessionId: string, facts: IntentFact[]): Promise<IntentFact[]> {
    for (const f of facts) {
      // save_fact RPC = INSERT ... ON CONFLICT DO UPDATE ... WHERE confirmed=false.
      // RETURNING이 비면 확정값 보호로 스킵된 것 — 그대로 둔다 (P1)
      const { data, error } = await this.db.rpc("save_fact", {
        p_id: f.id,
        p_intent_id: sessionId,
        p_key: f.key,
        p_value: f.value,
        p_confidence: f.confidence,
        p_source_span: f.sourceSpan ?? null,
      });
      if (error) this.fail("save_fact", error);
      if ((data ?? []).length > 0) await this.audit("fact.upsert", f.key);
    }
    const { data, error } = await this.db
      .from("intent_facts").select("*").eq("intent_id", sessionId);
    if (error) this.fail("facts.select", error);
    return (data ?? []).map(toFact);
  }

  async findFact(factId: string) {
    const { data, error } = await this.db
      .from("intent_facts").select("*").eq("id", factId).maybeSingle();
    if (error) this.fail("facts.select", error);
    if (!data) return undefined;
    const session = await this.getSession(data.intent_id);
    if (!session) return undefined;
    return { session, fact: toFact(data) };
  }

  async patchFactValue(factId: string, value: IntentFact["value"]) {
    const { data, error } = await this.db
      .from("intent_facts")
      .update({
        value,
        confidence: 1,
        confirmed_by_user: false, // 값이 바뀌면 확정 무효 (P1)
        updated_at: new Date().toISOString(),
      })
      .eq("id", factId)
      .select()
      .maybeSingle();
    if (error) this.fail("facts.patch", error);
    if (!data) return undefined;
    await this.audit("fact.patch", factId);
    return toFact(data);
  }

  async confirmFacts(sessionId: string): Promise<number> {
    const { data, error } = await this.db
      .from("intent_facts")
      // P1-CONFIRM-PATH: 유일한 정당한 확정 지점 (FR-103 확인 버튼) — gate:check 4번 예외 마커
      .update({ confirmed_by_user: true, updated_at: new Date().toISOString() })
      .eq("intent_id", sessionId)
      .eq("confirmed_by_user", false)
      .select("id");
    if (error) this.fail("facts.confirm", error);
    return (data ?? []).length;
  }

  async createDraft(intentId: string, docType: DocType, verdict: GateVerdict) {
    const row = {
      id: randomUUID(),
      intent_id: intentId,
      doc_type: docType,
      gate_verdict: verdict,
    };
    const { data, error } = await this.db
      .from("document_drafts").insert(row).select().single();
    if (error) this.fail("drafts.insert", error);
    return toDraft(data);
  }

  async getDraft(draftId: string) {
    const { data, error } = await this.db
      .from("document_drafts").select("*").eq("id", draftId).maybeSingle();
    if (error) this.fail("drafts.select", error);
    return data ? toDraft(data) : undefined;
  }

  async findDraftByDocumentId(modusignDocumentId: string) {
    const { data, error } = await this.db
      .from("document_drafts")
      .select("*")
      .eq("modusign_document_id", modusignDocumentId)
      .maybeSingle();
    if (error) this.fail("drafts.byDocumentId", error);
    return data ? toDraft(data) : undefined;
  }

  async markDraftRequested(draftId: string, modusignDocumentId: string) {
    const { error } = await this.db
      .from("document_drafts")
      .update({
        status: "REQUESTED",
        modusign_document_id: modusignDocumentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId);
    if (error) this.fail("drafts.markRequested", error);
  }

  async syncDraftStatus(draftId: string, status: DocStatus, rejectReason?: string | null) {
    const patch: Row = { status, updated_at: new Date().toISOString() };
    if (rejectReason !== undefined) patch.reject_reason = rejectReason;
    const { error } = await this.db
      .from("document_drafts").update(patch).eq("id", draftId);
    if (error) this.fail("drafts.syncStatus", error);
  }

  async insertWebhookEvent(input: WebhookEventInput): Promise<"INSERTED" | "DUPLICATE"> {
    // ON CONFLICT DO NOTHING — ignoreDuplicates:true + select()로 삽입 여부를 읽는다.
    // (facts의 DO UPDATE와 쌍둥이 구문·정반대 의도 — port.ts 주석 참조)
    const { data, error } = await this.db
      .from("webhook_events")
      .upsert(
        {
          external_event_id: input.externalEventId,
          event: input.event,
          modusign_document_id: input.modusignDocumentId ?? null,
          payload: input.payload,
        },
        { onConflict: "external_event_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) this.fail("webhook.insert", error);
    return (data ?? []).length > 0 ? "INSERTED" : "DUPLICATE";
  }

  async listUnprocessedEvents(): Promise<WebhookEventRecord[]> {
    const { data, error } = await this.db
      .from("webhook_events").select("*").is("processed_at", null).order("id");
    if (error) this.fail("webhook.list", error);
    return (data ?? []).map((r: Row) => ({
      id: r.id,
      externalEventId: r.external_event_id,
      event: r.event,
      modusignDocumentId: r.modusign_document_id,
      payload: r.payload,
      receivedAt: iso(r.received_at),
      processedAt: iso(r.processed_at),
    }));
  }

  async markEventProcessed(id: number) {
    const { error } = await this.db
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) this.fail("webhook.markProcessed", error);
  }

  async recordGateVerdict(input: GateVerdictRecord): Promise<void> {
    const { error } = await this.db.from("gate_verdicts").insert({
      doc_type: input.docType,
      verdict: input.verdict,
      was_sign_attempt: input.wasSignAttempt,
      statutes: input.statutes,
    });
    if (error) this.fail("gate_verdicts.insert", error);
  }

  async getGateStats(): Promise<GateStats> {
    const { data, error } = await this.db
      .from("gate_verdicts")
      .select("doc_type, verdict, was_sign_attempt, statutes");
    if (error) this.fail("gate_verdicts.select", error);

    const byDocType: Record<string, number> = {};
    const statute = new Map<string, number>();
    const byVerdict: Record<string, number> = {};
    let blockedTotal = 0;

    for (const r of (data ?? []) as Row[]) {
      byVerdict[r.verdict] = (byVerdict[r.verdict] ?? 0) + 1;
      // 인메모리와 같은 규칙 — 무효 판정 전부. was_sign_attempt는 상세 열이지 필터가 아니다
      if (r.verdict !== "ESIGN_INVALID") continue;
      blockedTotal += 1;
      byDocType[r.doc_type] = (byDocType[r.doc_type] ?? 0) + 1;
      for (const st of (r.statutes ?? []) as { id: string }[]) {
        statute.set(st.id, (statute.get(st.id) ?? 0) + 1);
      }
    }
    return {
      blockedTotal,
      byDocType,
      byStatute: [...statute].map(([id, count]) => ({ id, count })),
      byVerdict,
      totalEvaluations: (data ?? []).length,
    };
  }

  async recordMetric(input: MetricRecord): Promise<void> {
    const { error } = await this.db
      .from("pipeline_metrics")
      .insert({ stage: input.stage, ok: input.ok, ms: input.ms });
    if (error) this.fail("pipeline_metrics.insert", error);
  }

  async getPipelineStats(): Promise<StageStat[]> {
    // 분위수는 앱에서 계산한다 — 두 구현이 같은 코드를 써야 수치가 어긋나지 않는다
    const { data, error } = await this.db
      .from("pipeline_metrics")
      .select("stage, ok, ms")
      .order("id", { ascending: false })
      .limit(5000); // 최근 구간만 — 무한 성장 방어
    if (error) this.fail("pipeline_metrics.select", error);
    return summarizeMetrics((data ?? []) as MetricRecord[]);
  }

  async listStaleRequestedDrafts(olderThanMs: number): Promise<DraftRecord[]> {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const { data, error } = await this.db
      .from("document_drafts")
      .select("*")
      .eq("status", "REQUESTED")
      .lte("updated_at", cutoff);
    if (error) this.fail("drafts.stale", error);
    return (data ?? []).map(toDraft);
  }

  async listDocumentsByUser(
    userId: string,
    filter?: { docType?: DocType; status?: DocStatus; from?: string; to?: string },
  ): Promise<DraftRecord[]> {
    // 소유자 열이 draft에 없다 — intents를 거쳐야 한다. 서비스 롤이라 RLS가 걸러주지
    // 않으므로 **명시 필터가 유일한 방어선**이다 (D-18)
    const { data: mine, error: iErr } = await this.db
      .from("intents").select("id").eq("user_id", userId);
    if (iErr) this.fail("intents.byUser", iErr);
    const ids = (mine ?? []).map((r: { id: string }) => r.id);
    if (ids.length === 0) return [];

    let q = this.db.from("document_drafts").select("*").in("intent_id", ids);
    if (filter?.docType) q = q.eq("doc_type", filter.docType);
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.from) q = q.gte("created_at", filter.from);
    if (filter?.to) q = q.lte("created_at", filter.to);

    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) this.fail("drafts.byUser", error);
    return (data ?? []).map(toDraft);
  }

  async recordReconcile(corrected: number): Promise<void> {
    // 전용 테이블 없이 audit_logs를 쓴다 — 리컨실 이력은 append-only가 오히려 맞다
    await this.audit("reconcile.run", "cron", { corrected });
  }

  async getReconcileState() {
    const { data, error } = await this.db
      .from("audit_logs")
      .select("detail, created_at")
      .eq("action", "reconcile.run")
      .order("id", { ascending: false })
      .limit(500);
    if (error) this.fail("audit.reconcile", error);
    const rows = (data ?? []) as Row[];
    return {
      lastSyncAt: rows[0] ? iso(rows[0].created_at) : null,
      correctedTotal: rows.reduce((n, r) => n + Number(r.detail?.corrected ?? 0), 0),
    };
  }

  async recordAudit(action: string, subject: string, detail?: unknown): Promise<void> {
    await this.audit(action, subject, detail);
  }

  async getAuditSummary(action: string, subject: string) {
    const { data, error } = await this.db
      .from("audit_logs")
      .select("created_at")
      .eq("action", action)
      .eq("subject", subject)
      .order("id", { ascending: false });
    if (error) this.fail("audit.summary", error);
    const rows = (data ?? []) as Row[];
    return { count: rows.length, lastAt: rows[0] ? iso(rows[0].created_at) : null };
  }

  // mock 전용 상태다. 전용 테이블·RLS 결정을 새로 만들지 않고 append-only 감사 로그에
  // 얹는다 — 최신 행이 현재 상태다 (recordReconcile과 같은 판단).
  async putMockDoc(documentId: string, state: Record<string, unknown>): Promise<void> {
    await this.audit("mock.doc", documentId, state);
  }

  async getMockDoc(documentId: string) {
    const { data, error } = await this.db
      .from("audit_logs")
      .select("detail")
      .eq("action", "mock.doc")
      .eq("subject", documentId)
      .order("id", { ascending: false })
      .limit(1);
    if (error) this.fail("audit.mockDoc", error);
    const row = (data ?? [])[0] as Row | undefined;
    return (row?.detail as Record<string, unknown>) ?? undefined;
  }

  // ── 마음 유언 (FR-111) ────────────────────────────────────
  // ⚠ 20260730160227_heartwill.sql이 적용된 프로젝트에서만 동작한다. 테이블이 없으면
  //   this.fail이 던진다 — **조용한 폴백은 없다**(보안 7조). 인메모리 구현은 별개 클래스라
  //   이 실패에 영향받지 않는다.

  private toParagraph = (r: Row): HeartWillParagraph => ({
    id: r.id,
    ord: r.ord,
    body: r.body,
    origin: r.origin as HeartWillOrigin,
    sourceUtteranceId: r.source_utterance_id,
    acceptedAt: iso(r.accepted_at),
    createdAt: iso(r.created_at),
  });

  /** intent당 1건 (UNIQUE). create=false면 없을 때 undefined */
  private async heartWillDocId(intentId: string, create: boolean): Promise<string | undefined> {
    const { data, error } = await this.db
      .from("heart_will_documents").select("id").eq("intent_id", intentId).maybeSingle();
    if (error) this.fail("heart_will_documents.select", error);
    if (data) return data.id;
    if (!create) return undefined;
    const id = randomUUID();
    const ins = await this.db.from("heart_will_documents").insert({ id, intent_id: intentId });
    if (ins.error) this.fail("heart_will_documents.insert", ins.error);
    return id;
  }

  /** 현재 버전 = 아무도 prev로 가리키지 않는 버전. 체인이 선형이므로 유일하다
   *  (heart_will_versions_linear UNIQUE 인덱스가 분기를 막는다) */
  private async heartWillHeadRow(documentId: string): Promise<Row | undefined> {
    const { data, error } = await this.db
      .from("heart_will_versions")
      .select("id, prev_version_id, created_at")
      .eq("document_id", documentId)
      .order("created_at");
    if (error) this.fail("heart_will_versions.select", error);
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return undefined;
    const linked = new Set(rows.map((r) => r.prev_version_id).filter(Boolean));
    return rows.find((r) => !linked.has(r.id)) ?? rows[rows.length - 1];
  }

  private async heartWillVersion(documentId: string, row: Row): Promise<HeartWillVersion> {
    const { data, error } = await this.db
      .from("heart_will_paragraphs").select("*").eq("version_id", row.id).order("ord");
    if (error) this.fail("heart_will_paragraphs.select", error);
    return {
      versionId: row.id,
      documentId,
      prevVersionId: row.prev_version_id,
      paragraphs: (data ?? []).map(this.toParagraph),
      createdAt: iso(row.created_at),
    };
  }

  private async insertHeartWillVersion(
    documentId: string,
    prevVersionId: string | null,
    paragraphs: Omit<HeartWillParagraph, "id" | "createdAt">[],
  ): Promise<string> {
    const versionId = randomUUID();
    const v = await this.db.from("heart_will_versions").insert({
      id: versionId,
      document_id: documentId,
      prev_version_id: prevVersionId,
    });
    if (v.error) this.fail("heart_will_versions.insert", v.error);
    if (paragraphs.length > 0) {
      const p = await this.db.from("heart_will_paragraphs").insert(
        paragraphs.map((x) => ({
          id: randomUUID(),
          version_id: versionId,
          ord: x.ord,
          body: x.body,
          origin: x.origin,
          source_utterance_id: x.sourceUtteranceId,
          accepted_at: x.acceptedAt,
        })),
      );
      if (p.error) this.fail("heart_will_paragraphs.insert", p.error);
    }
    return versionId;
  }

  async draftHeartWillParagraphs(
    sessionId: string,
    drafts: HeartWillParagraphDraft[],
  ): Promise<HeartWillVersion> {
    // FK가 잡아주기 **전에** 우리가 먼저 막는다. FK 위반 메시지는 사용자에게 보여줄 수 없고,
    // 삭제된 발화는 FK를 통과하지만 근거로는 죽은 발화다 (소프트 삭제, D-10).
    const { data: utts, error } = await this.db
      .from("utterances").select("id").eq("intent_id", sessionId).is("deleted_at", null);
    if (error) this.fail("utterances.select", error);
    const alive = new Set((utts ?? []).map((u: Row) => u.id));
    for (const d of drafts) {
      if (!d.sourceUtteranceId || !alive.has(d.sourceUtteranceId)) {
        throw new Error("[store] 근거 발화 없는 문단은 만들 수 없다 (FR-111)");
      }
      if (d.body.trim() === "") throw new Error("[store] 빈 문단은 만들 수 없다");
    }

    const documentId = (await this.heartWillDocId(sessionId, true))!;
    let head = await this.heartWillHeadRow(documentId);
    if (!head) {
      const rootId = await this.insertHeartWillVersion(documentId, null, []);
      head = { id: rootId, prev_version_id: null, created_at: new Date().toISOString() };
    }

    const base = await this.heartWillVersion(documentId, head);
    const rows = drafts.map((d, i) => ({
      id: randomUUID(),
      version_id: head!.id,
      ord: base.paragraphs.length + i,
      body: d.body,
      origin: d.origin,
      source_utterance_id: d.sourceUtteranceId,
      accepted_at: null, // 기본은 미승인 (P1)
    }));
    if (rows.length > 0) {
      const ins = await this.db.from("heart_will_paragraphs").insert(rows);
      if (ins.error) this.fail("heart_will_paragraphs.insert", ins.error);
    }
    return this.heartWillVersion(documentId, head);
  }

  async getHeartWillHead(sessionId: string): Promise<HeartWillVersion | undefined> {
    const documentId = await this.heartWillDocId(sessionId, false);
    if (!documentId) return undefined;
    const head = await this.heartWillHeadRow(documentId);
    if (!head) return undefined;
    return this.heartWillVersion(documentId, head);
  }

  async applyHeartWill(
    sessionId: string,
    acceptedParagraphIds: string[],
  ): Promise<HeartWillApplyResult | null> {
    const documentId = await this.heartWillDocId(sessionId, false);
    if (!documentId) return null;
    const headRow = await this.heartWillHeadRow(documentId);
    if (!headRow) return null;
    const head = await this.heartWillVersion(documentId, headRow);
    const wanted = new Set(acceptedParagraphIds);

    const previous = head.paragraphs.filter((p) => p.acceptedAt !== null);
    const accepted = head.paragraphs.filter((p) => p.acceptedAt === null && wanted.has(p.id));
    if (accepted.length === 0) return null; // 승인 없으면 버전을 만들지 않는다 (P1)
    const stillPending = head.paragraphs.filter(
      (p) => p.acceptedAt === null && !wanted.has(p.id),
    );

    // 인메모리와 같은 규칙 — 대체(같은 발화)·이월(본문)·유예(미승인 초안).
    // 규칙의 진실은 store-contract 스위트다.
    const at = new Date().toISOString();
    const claimed = new Set(accepted.map((p) => p.sourceUtteranceId));
    const carried = previous.filter((p) => !claimed.has(p.sourceUtteranceId));
    const body = [...carried, ...accepted].map((p, i) => ({ ...p, ord: i, acceptedAt: at }));
    const pending = stillPending.map((p, i) => ({ ...p, ord: body.length + i }));

    const versionId = await this.insertHeartWillVersion(documentId, head.versionId, [
      ...body,
      ...pending,
    ]);
    const newRow = { id: versionId, prev_version_id: head.versionId, created_at: at };
    return {
      version: await this.heartWillVersion(documentId, newRow),
      previousParagraphs: previous,
    };
  }

  async appendLedgerNode(input: LedgerAppendInput): Promise<LedgerNode> {
    const chain = await this.listLedgerNodes(input.subjectId);
    // created_at을 명시해 넣는다 — 봉인된 값이라 DB default now()에 맡기면
    // 우리가 해시한 시각과 저장된 시각이 갈려 재검증이 즉시 깨진다
    const node = buildNode(chain.at(-1), input, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    const { data, error } = await this.db
      .from("intent_ledger_nodes")
      .insert({
        id: node.id,
        subject_id: node.subjectId,
        seq: node.seq,
        materiality: node.materiality,
        change_summary: node.changeSummary,
        change_reason: node.changeReason,
        condition_note: node.conditionNote ?? null,
        witness: node.witness ?? null,
        draft_id: node.draftId ?? null,
        prev_hash: node.prevHash,
        node_hash: node.nodeHash,
        created_at: node.createdAt,
      })
      .select()
      .single();
    // UNIQUE(subject_id, seq) · UNIQUE(subject_id, prev_hash) 위반은 동시 추가로
    // 체인이 갈라졌다는 뜻이다. 삼키지 않는다 — 분기된 원장은 없느니만 못하다
    if (error) this.fail("ledger.insert", error);
    return toLedgerNode(data);
  }

  async listLedgerNodes(subjectId: string): Promise<LedgerNode[]> {
    const { data, error } = await this.db
      .from("intent_ledger_nodes")
      .select("*")
      .eq("subject_id", subjectId)
      .order("seq");
    if (error) this.fail("ledger.select", error);
    return withDerivedStatus((data ?? []).map(toLedgerNode));
  }

  async getLedgerNode(nodeId: string): Promise<LedgerNode | undefined> {
    const { data, error } = await this.db
      .from("intent_ledger_nodes")
      .select("subject_id")
      .eq("id", nodeId)
      .limit(1);
    if (error) this.fail("ledger.getNode", error);
    const subjectId = (data ?? [])[0]?.subject_id;
    if (!subjectId) return undefined;
    // 같은 체인을 통째로 읽어 유도 상태를 붙인다 — 한 건만 읽으면 ACTIVE 판정이 불가능하다
    const chain = await this.listLedgerNodes(subjectId);
    return chain.find((n) => n.id === nodeId);
  }

  async countDraftsByStatus(): Promise<Record<string, number>> {
    const { data, error } = await this.db.from("document_drafts").select("status");
    if (error) this.fail("drafts.countByStatus", error);
    const out: Record<string, number> = {};
    for (const r of (data ?? []) as Row[]) out[r.status] = (out[r.status] ?? 0) + 1;
    return out;
  }

  async createObligation(input: {
    kind: ObligationKind;
    subjectId: string;
    dueAt: string;
  }): Promise<Obligation | undefined> {
    // 같은 대상의 같은 종류가 아직 발화 전이면 만들지 않는다 (독촉 방지, FR-113)
    const { data: pending, error: pendErr } = await this.db
      .from("obligations")
      .select("id")
      .eq("kind", input.kind)
      .eq("subject_id", input.subjectId)
      .is("fired_at", null)
      .limit(1);
    if (pendErr) this.fail("obligations.pending", pendErr);
    if ((pending ?? []).length > 0) return undefined;

    const { data, error } = await this.db
      .from("obligations")
      .insert({ kind: input.kind, subject_id: input.subjectId, due_at: input.dueAt })
      .select()
      .single();
    if (error) this.fail("obligations.create", error);
    return toObligation(data as Row);
  }

  async listDueObligations(now: string): Promise<Obligation[]> {
    const { data, error } = await this.db
      .from("obligations")
      .select("*")
      .is("fired_at", null)
      .lte("due_at", now)
      .order("due_at", { ascending: true });
    if (error) this.fail("obligations.due", error);
    return (data ?? []).map(toObligation);
  }

  async markObligationFired(id: string, firedAt: string): Promise<void> {
    const { error } = await this.db
      .from("obligations")
      .update({ fired_at: firedAt })
      .eq("id", id);
    if (error) this.fail("obligations.fire", error);
  }

  async listObligations(subjectId?: string): Promise<Obligation[]> {
    let q = this.db.from("obligations").select("*").order("due_at", { ascending: true });
    if (subjectId) q = q.eq("subject_id", subjectId);
    const { data, error } = await q;
    if (error) this.fail("obligations.list", error);
    return (data ?? []).map(toObligation);
  }

  async shiftObligationDueDates(months: number): Promise<number> {
    // 가짜 시계 대신 기한을 당긴다 — 스케줄러는 실제 그대로 돈다 (NFR-707)
    const { data, error } = await this.db
      .from("obligations")
      .select("id, due_at")
      .is("fired_at", null);
    if (error) this.fail("obligations.shift.list", error);
    let shifted = 0;
    for (const row of (data ?? []) as Row[]) {
      const d = new Date(row.due_at);
      d.setMonth(d.getMonth() - months);
      const { error: upErr } = await this.db
        .from("obligations")
        .update({ due_at: d.toISOString() })
        .eq("id", row.id);
      if (upErr) this.fail("obligations.shift", upErr);
      shifted += 1;
    }
    return shifted;
  }

  async saveEmbeddings(
    intentId: string,
    rows: { utteranceId: string; vector: number[] }[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const { data, error } = await this.db
      .from("utterance_embeddings")
      .upsert(
        rows.map((r) => ({
          utterance_id: r.utteranceId,
          intent_id: intentId,
          // pgvector는 '[a,b,c]' 문자열 리터럴을 받는다
          embedding: `[${r.vector.join(",")}]`,
        })),
        { onConflict: "utterance_id", ignoreDuplicates: true },
      )
      .select("utterance_id");
    if (error) this.fail("embeddings.save", error);
    return (data ?? []).length;
  }

  async listUnembeddedUtterances(intentId: string) {
    // 소프트 삭제된 발화는 애초에 대상이 아니다 — 지운 이야기를 벡터로 남기지 않는다
    const { data, error } = await this.db
      .from("utterances")
      .select("id, text, utterance_embeddings(utterance_id)")
      .eq("intent_id", intentId)
      .is("deleted_at", null);
    if (error) this.fail("embeddings.listUnembedded", error);
    return (data ?? [])
      .filter((r: Row) => !r.utterance_embeddings?.length)
      .map((r: Row) => ({ utteranceId: r.id, text: r.text }));
  }

  async searchSimilarUtterances(intentId: string, queryVector: number[], k: number) {
    // ⚠ ANN 인덱스가 없다(4096차원은 pgvector 인덱스 상한 밖 — 마이그레이션 주석 참조).
    //    순차 스캔이므로 이 규모에서는 문제가 없고 정확도는 오히려 더 높다.
    const { data, error } = await this.db.rpc("search_utterances", {
      p_intent_id: intentId,
      p_query: `[${queryVector.join(",")}]`,
      p_k: k,
    });
    if (error) this.fail("embeddings.search", error);
    return (data ?? []).map((r: Row) => ({
      utteranceId: r.utterance_id,
      sessionId: r.intent_id,
      text: r.text,
      spokenAt: iso(r.spoken_at),
      score: Number(r.score),
    }));
  }

  async requestFamilyAcks(
    ledgerNodeId: string,
    targets: (FamilyAckTarget & { documentId: string | null })[],
  ): Promise<FamilyAckRecord[]> {
    if (targets.length === 0) return []; // 알리지 않을 자유 (P4)
    const rows = targets.map((t) => ({
      id: randomUUID(),
      ledger_node_id: ledgerNodeId,
      recipient_id: t.recipientId,
      recipient_name: t.recipientName ?? null,
      relation: t.relation ?? null,
      status: "PENDING",
      document_id: t.documentId,
    }));
    const { data, error } = await this.db.from("family_acks").insert(rows).select();
    if (error) this.fail("familyAcks.insert", error);
    return (data ?? []).map(toFamilyAck);
  }

  async listFamilyAcks(ledgerNodeId: string): Promise<FamilyAckRecord[]> {
    const { data, error } = await this.db
      .from("family_acks")
      .select("*")
      .eq("ledger_node_id", ledgerNodeId)
      .order("notified_at", { ascending: true });
    if (error) this.fail("familyAcks.list", error);
    return (data ?? []).map(toFamilyAck);
  }

  async resolveFamilyAck(
    documentId: string,
    status: "ACKNOWLEDGED" | "DECLINED",
    declinedReason?: string | null,
  ): Promise<FamilyAckRecord | undefined> {
    const { data, error } = await this.db
      .from("family_acks")
      .update({
        status,
        signed_at: new Date().toISOString(),
        declined_reason: status === "DECLINED" ? (declinedReason ?? null) : null,
      })
      .eq("document_id", documentId)
      .select();
    if (error) this.fail("familyAcks.resolve", error);
    const row = (data ?? [])[0];
    return row ? toFamilyAck(row) : undefined;
  }

  async createAsset(input: AssetWriteInput): Promise<Asset> {
    const row = {
      id: randomUUID(),
      user_id: input.userId,
      category: input.category,
      label: input.label,
      // 저장 직전 다시 마스킹한다 — 호출부가 무엇을 보내든 표에는 마스킹된 값만 남는다 (NFR-712)
      masked_identifier: maskIdentifier(input.maskedIdentifier),
      estimated_value_krw: input.estimatedValueKrw ?? null,
      origin: input.origin,
      confidence: input.confidence ?? null,
      // 확인 여부는 출처가 정한다. 판독 산출물은 미확인으로 시작하고(P1),
      // 본인이 직접 쓴 값은 그 입력 자체가 확인이다
      confirmed: input.origin === "MANUAL",
      beneficiary_id: input.beneficiaryId ?? null,
      story: input.story ?? null,
      source_upload_id: input.sourceUploadId ?? null,
      disposition: input.category === "DIGITAL" ? input.disposition : null,
    };
    const { data, error } = await this.db.from("assets").insert(row).select().single();
    if (error) this.fail("assets.insert", error);
    return toAsset(data as Row);
  }

  async listAssets(userId: string): Promise<Asset[]> {
    const { data, error } = await this.db
      .from("assets")
      .select("*")
      .eq("user_id", userId) // 소유 필터는 코드가 명시적으로 건다 (D-18)
      .order("created_at", { ascending: true });
    if (error) this.fail("assets.list", error);
    return (data ?? []).map(toAsset);
  }

  async createBeneficiary(input: BeneficiaryWriteInput): Promise<Beneficiary> {
    const row = {
      id: randomUUID(),
      user_id: input.userId,
      name: input.name,
      relation: input.relation,
      recipient_id: input.recipientId ?? null,
    };
    const { data, error } = await this.db.from("beneficiaries").insert(row).select().single();
    if (error) this.fail("beneficiaries.insert", error);
    return toBeneficiary(data as Row);
  }

  async listBeneficiaries(userId: string): Promise<Beneficiary[]> {
    const { data, error } = await this.db
      .from("beneficiaries")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) this.fail("beneficiaries.list", error);
    return (data ?? []).map(toBeneficiary);
  }

  async createEvidence(input: Omit<EvidenceRecord, "id" | "createdAt">) {
    const row = {
      id: randomUUID(),
      draft_id: input.draftId,
      pdf_storage_path: input.pdfStoragePath,
      sha256: input.sha256,
      signed_at: input.signedAt,
      parties: input.parties,
    };
    const { data, error } = await this.db
      .from("evidences").insert(row).select().single();
    if (error) this.fail("evidences.insert", error);
    return {
      id: data.id,
      draftId: data.draft_id,
      pdfStoragePath: data.pdf_storage_path,
      sha256: data.sha256,
      signedAt: iso(data.signed_at),
      parties: data.parties,
      createdAt: iso(data.created_at),
    };
  }

  async getEvidenceByDraft(draftId: string) {
    const { data, error } = await this.db
      .from("evidences").select("*").eq("draft_id", draftId).maybeSingle();
    if (error) this.fail("evidences.select", error);
    if (!data) return undefined;
    return {
      id: data.id,
      draftId: data.draft_id,
      pdfStoragePath: data.pdf_storage_path,
      sha256: data.sha256,
      signedAt: iso(data.signed_at),
      parties: data.parties,
      createdAt: iso(data.created_at),
    };
  }
}
