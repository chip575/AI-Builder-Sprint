// M-MOCK — 인메모리 mock signer (NFR-707 · 02.3 §2)
// API 키 없이 전체 서명 흐름이 돈다. 상태 전이·멱등성·역행 방지는
// 실제 웹훅 처리와 같은 규칙을 따른다 — 흉내가 아니라 같은 상태 머신이다.
import { randomUUID } from "node:crypto";
import type { DocStatus } from "../../contracts/common";
import type { ModusignWebhookPayload } from "../../contracts/webhook";
import type {
  DocumentDetail,
  SignerPort,
  SignRequestInput,
  SignRequestResult,
} from "../port";

/** 임베디드 URL 만료 — 2시간 (FR-502) */
const EMBED_TTL_MS = 2 * 60 * 60 * 1000;

/** 허용 전이 표 — 여기 없는 전이는 무시된다 (역행 방지, 02.3 §3) */
const ALLOWED: Record<DocStatus, DocStatus[]> = {
  DRAFT: ["REQUESTED"],
  REQUESTED: ["COMPLETED", "REJECTED", "CANCELED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELED: [],
};

/** 외부 이벤트명 → 목표 상태 */
const EVENT_TO_STATUS: Record<string, DocStatus> = {
  document_requested: "REQUESTED",
  document_completed: "COMPLETED",
  document_rejected: "REJECTED",
  document_canceled: "CANCELED",
};

interface MockDoc extends DocumentDetail {
  embeddedUrl: string;
  expiresAt: string;
}

export class MockSigner implements SignerPort {
  private docs = new Map<string, MockDoc>();
  /** 처리한 이벤트 ID — webhook_events ON CONFLICT DO NOTHING의 인메모리판 (멱등성) */
  private processedEvents = new Set<string>();
  /** 부수효과 횟수 계측 — "동일 이벤트 5회 → 부수효과 1회" 테스트용 (FR-503) */
  public sideEffectCount = 0;

  constructor(private autoCompleteMs?: number) {}

  private create(input: SignRequestInput): MockDoc {
    const now = Date.now();
    const doc: MockDoc = {
      documentId: `mock-${randomUUID()}`,
      status: "REQUESTED",
      parties: [
        { name: "남기다", role: "REQUESTER", signedAt: new Date(now).toISOString() },
        { name: input.signerName, role: "SIGNER", signedAt: null },
      ],
      completedAt: null,
      rejectReason: null,
      metadata: { draftId: input.draftId, templateKey: input.templateKey },
      embeddedUrl: `/mock-sign/${input.draftId}`,
      expiresAt: new Date(now + EMBED_TTL_MS).toISOString(),
    };
    this.docs.set(doc.documentId, doc);
    if (this.autoCompleteMs !== undefined) {
      // 02.4 §5 — mock 모드는 일정 시간 뒤 자동 완료로 서명자를 흉내낸다
      const t = setTimeout(() => {
        this.simulateEvent(doc.documentId, "document_completed");
      }, this.autoCompleteMs);
      if (typeof t === "object" && "unref" in t) t.unref();
    }
    return doc;
  }

  async requestWithTemplate(input: SignRequestInput): Promise<SignRequestResult> {
    const doc = this.create(input);
    return {
      documentId: doc.documentId,
      embeddedUrl: doc.embeddedUrl,
      expiresAt: doc.expiresAt,
    };
  }

  async createEmbeddedDraft(
    input: SignRequestInput,
  ): Promise<Required<SignRequestResult>> {
    const doc = this.create(input);
    return {
      documentId: doc.documentId,
      embeddedUrl: doc.embeddedUrl,
      expiresAt: doc.expiresAt,
    };
  }

  async getDocument(documentId: string): Promise<DocumentDetail | null> {
    return this.docs.get(documentId) ?? null;
  }

  async listDocuments(filter?: { status?: DocStatus }): Promise<DocumentDetail[]> {
    const all = [...this.docs.values()];
    return filter?.status ? all.filter((d) => d.status === filter.status) : all;
  }

  async resendNotification(documentId: string): Promise<void> {
    if (!this.docs.has(documentId)) throw new Error(`unknown document: ${documentId}`);
    // mock — 실 발송 없음. 발송 이력은 FR-507 구현부(라우트)가 기록한다.
  }

  async cancel(documentId: string, reason: string): Promise<void> {
    const doc = this.docs.get(documentId);
    if (!doc) throw new Error(`unknown document: ${documentId}`);
    if (this.transition(doc, "CANCELED")) doc.rejectReason = reason;
  }

  /** 허용 전이 표를 따르는 상태 변경. 허용되지 않으면 false (스킵 + 무시) */
  private transition(doc: MockDoc, to: DocStatus): boolean {
    if (!ALLOWED[doc.status].includes(to)) return false;
    doc.status = to;
    if (to === "COMPLETED") {
      const now = new Date().toISOString();
      doc.completedAt = now;
      for (const p of doc.parties) if (!p.signedAt) p.signedAt = now;
    }
    return true;
  }

  /**
   * 외부 이벤트 주입 (webhook-sim이 호출) — 멱등 처리 후 웹훅 페이로드를 반환한다.
   * 같은 eventId가 몇 번 오든 상태 전이·부수효과는 정확히 1회 (FR-503).
   */
  simulateEvent(
    documentId: string,
    event: string,
    eventId: string = randomUUID(),
  ): ModusignWebhookPayload | null {
    const doc = this.docs.get(documentId);
    if (!doc) return null;

    const payload: ModusignWebhookPayload = {
      eventId,
      event,
      documentId,
      requesterEmail: null,
      metadata: doc.metadata,
      occurredAt: new Date().toISOString(),
    };

    if (this.processedEvents.has(eventId)) return payload; // 중복 — 아무것도 안 함
    this.processedEvents.add(eventId);

    const target = EVENT_TO_STATUS[event];
    if (target && this.transition(doc, target)) {
      this.sideEffectCount += 1; // 실제 구현에서는 메일 발송·Obligation 생성 지점
    }
    return payload;
  }
}
