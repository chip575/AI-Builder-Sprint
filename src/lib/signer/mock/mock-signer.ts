// M-MOCK — 인메모리 mock signer (NFR-707 · 02.3 §2)
// API 키 없이 전체 서명 흐름이 돈다. 상태 전이·멱등성·역행 방지는
// 실제 웹훅 처리와 같은 규칙을 따른다 — 흉내가 아니라 같은 상태 머신이다.
import { randomUUID } from "node:crypto";
import type { DocStatus } from "../../contracts/common";
import type { ModusignWebhookPayload } from "../../contracts/webhook";
import { canTransition, EVENT_TO_STATUS } from "../state-machine";
import { store } from "../../store";
import type {
  DocumentDetail,
  DocumentListFilter,
  SignerPort,
  SignRequestInput,
  SignRequestResult,
} from "../port";

/** 임베디드 URL 만료 — 2시간 (FR-502) */
const EMBED_TTL_MS = 2 * 60 * 60 * 1000;

interface MockDoc extends DocumentDetail {
  embeddedUrl: string;
  expiresAt: string;
}

export class MockSigner implements SignerPort {
  // 맵은 **빠른 경로일 뿐**이다. 서버리스는 요청마다 인스턴스가 갈릴 수 있어
  // 이것만 믿으면 "서명 요청은 A에서, 완료 시뮬은 B에서"에 문서를 잃는다.
  // 진짜 자리는 store의 mock 슬롯이다 (load/persist 참조).
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
      // 계약(SignRes)이 절대 URL을 요구한다 — 상대 경로면 응답 parse에서 죽는다
      embeddedUrl: `https://mock.namgida.local/sign/${input.draftId}`,
      expiresAt: new Date(now + EMBED_TTL_MS).toISOString(),
    };
    this.docs.set(doc.documentId, doc);
    void this.persist(doc);
    if (this.autoCompleteMs !== undefined) {
      // 02.4 §5 — mock 모드는 일정 시간 뒤 자동 완료로 서명자를 흉내낸다
      const t = setTimeout(() => {
        void this.simulateEvent(doc.documentId, "document_all_signed");
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

  /** 외부 세계의 상태를 우리 기록과 **다른 자리**에 남긴다.
   *  실패해도 흐름을 막지 않는다 — mock은 개발 보조이지 진실이 아니다. */
  private async persist(doc: MockDoc): Promise<void> {
    // 쓰기 지점이 하나라 여기서 찍으면 빠지는 경로가 없다.
    // 델타 조회(updatedSince)의 기준이므로 real의 updatedAt과 같은 뜻이어야 한다
    doc.updatedAt = new Date().toISOString();
    try {
      await store.putMockDoc(doc.documentId, {
        doc: doc as unknown as Record<string, unknown>,
        events: [...this.processedEvents],
      });
    } catch (err) {
      console.warn("[mock-signer] 외부 상태 저장 실패:", (err as Error).message);
    }
  }

  /** 맵 우선, 없으면 store의 mock 슬롯에서 복원한다 (인스턴스 교체 대비). */
  private async load(documentId: string): Promise<MockDoc | null> {
    const cached = this.docs.get(documentId);
    if (cached) return cached;

    let saved: Record<string, unknown> | undefined;
    try {
      saved = await store.getMockDoc(documentId);
    } catch (err) {
      console.warn("[mock-signer] 외부 상태 복원 실패:", (err as Error).message);
    }
    const doc = saved?.doc as MockDoc | undefined;
    if (!doc) return null;

    // 멱등성 판정도 함께 복원한다 — 이것 없이는 인스턴스가 갈릴 때마다
    // 같은 이벤트가 "처음 본 이벤트"가 되어 부수효과가 반복된다.
    for (const id of (saved?.events as string[] | undefined) ?? []) {
      this.processedEvents.add(id);
    }
    this.docs.set(documentId, doc);
    return doc;
  }

  async getDocument(documentId: string): Promise<DocumentDetail | null> {
    return this.load(documentId);
  }

  async listDocuments(filter?: DocumentListFilter): Promise<DocumentDetail[]> {
    // real 어댑터와 **같은 규칙**으로 거른다. mock이 더 관대하면 배포에서만 깨진다
    let all = [...this.docs.values()];
    if (filter?.status) all = all.filter((d) => d.status === filter.status);
    if (filter?.updatedSince) {
      const since = filter.updatedSince;
      all = all.filter((d) => (d.updatedAt ?? "") >= since);
    }
    // 최신순 — 델타 조회는 "바뀐 것부터"가 자연스럽다
    all.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return filter?.limit ? all.slice(0, filter.limit) : all;
  }

  async resendNotification(documentId: string): Promise<void> {
    if (!(await this.load(documentId))) throw new Error(`unknown document: ${documentId}`);
    // mock — 실 발송 없음. 발송 이력은 FR-507 구현부(라우트)가 기록한다.
  }

  async cancel(documentId: string, reason: string): Promise<void> {
    const doc = await this.load(documentId);
    if (!doc) throw new Error(`unknown document: ${documentId}`);
    if (this.transition(doc, "CANCELED")) {
      doc.rejectReason = reason;
      await this.persist(doc);
    }
  }

  /** 허용 전이 표를 따르는 상태 변경. 허용되지 않으면 false (스킵 + 무시) */
  private transition(doc: MockDoc, to: DocStatus): boolean {
    if (!canTransition(doc.status, to)) return false;
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
  async simulateEvent(
    documentId: string,
    event: string,
    eventId: string = randomUUID(),
  ): Promise<ModusignWebhookPayload | null> {
    const doc = await this.load(documentId);
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
    // 전이가 없어도 남긴다 — 중복 이벤트 판정(events)이 갱신됐다.
    // ⚠ draft는 건드리지 않는다. 외부만 움직여야 웹훅 유실을 재현할 수 있다 (FR-504).
    await this.persist(doc);
    return payload;
  }
}
