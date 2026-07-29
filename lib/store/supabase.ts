// Supabase StorePort — service role + user_id 명시 필터 (D-18).
// 컬럼(snake_case) ↔ 코드(camelCase) 번역과 명세 필드명 매핑(confirmed_by_user ↔ confirmed)은
// 전부 여기서 한다. 규칙의 진실은 store-contract 스위트 — 인메모리와 같은 스위트를 통과해야 한다.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { BranchOrigin, BranchType, DocStatus, DocType } from "../contracts/common";
import type { IntentFact } from "../contracts/extract";
import type { GateVerdict } from "../contracts/gate";
import type { StorePort } from "./port";
import {
  DEV_USER_ID,
  type BranchProposalRecord,
  type DraftRecord,
  type EvidenceRecord,
  type SessionRecord,
  type Utterance,
  type WebhookEventInput,
  type WebhookEventRecord,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

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
  at: r.spoken_at,
  deletedAt: r.deleted_at,
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
  createdAt: r.created_at,
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

  async getOrCreateSession(sessionId?: string | null): Promise<SessionRecord> {
    if (sessionId) {
      const found = await this.getSession(sessionId);
      if (found) return found;
    }
    const id = sessionId ?? randomUUID();
    const { error } = await this.db
      .from("intents")
      .insert({ id, user_id: DEV_USER_ID }); // NULL 금지 — dev 상수 (0002 전제)
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
      startedAt: intent.started_at,
      utterances: (utts.data ?? []).map(toUtterance),
      proposals: (props.data ?? []).map(
        (r: Row): BranchProposalRecord => ({
          id: r.id,
          branchType: r.branch_type as BranchType,
          origin: r.origin as BranchOrigin,
          sourceUtteranceId: r.source_utterance_id,
          createdAt: r.created_at,
        }),
      ),
      facts: (facts.data ?? []).map(toFact),
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
    // 트리거가 단방향 전이를 강제한다 — 이미 삭제된 행이면 예외 → false로 번역
    const { error } = await this.db
      .from("utterances")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", utteranceId)
      .is("deleted_at", null);
    if (error) return false;
    // eq+is 필터로 0행 매치면 update는 조용히 지나간다 — 실제 삭제됐는지 확인
    const { data } = await this.db
      .from("utterances").select("deleted_at").eq("id", utteranceId).maybeSingle();
    if (!data || data.deleted_at === null) return false;
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
      sourceUtteranceId: data.source_utterance_id,
      createdAt: data.created_at,
    };
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
      receivedAt: r.received_at,
      processedAt: r.processed_at,
    }));
  }

  async markEventProcessed(id: number) {
    const { error } = await this.db
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) this.fail("webhook.markProcessed", error);
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
      signedAt: data.signed_at,
      parties: data.parties,
      createdAt: data.created_at,
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
      signedAt: data.signed_at,
      parties: data.parties,
      createdAt: data.created_at,
    };
  }
}
