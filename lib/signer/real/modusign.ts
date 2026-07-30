// realSigner — 모두싸인 연동 (02.3 · ADR-4)
//
// 근거 문서 (전부 2026-07-30 확인):
//  · 템플릿 요청  POST /documents/request-with-template
//    https://developers.modusign.co.kr/reference/documentcontroller_createdocumentwithtemplate.md
//  · 상세 조회    GET  /documents/{documentId}
//    https://developers.modusign.co.kr/reference/documentcontroller_getdocument.md
//  · 취소         POST /documents/{documentId}/cancel   (message 2~200자 필수)
//    https://developers.modusign.co.kr/reference/documentcontroller_canceldocument.md
//  · 재발송       POST /documents/{documentId}/remind-signing  (본문 없음)
//    https://developers.modusign.co.kr/reference/documentcontroller_remindsigningrequest.md
//  · 인증         Authorization: Basic {credentials}
//
// ⚠ 문서 기준일 뿐 실측이 아니다. 키 도착 후 02.3 검증 게이트(임베디드 도메인 제한,
//   템플릿 필드 주입, 웹훅 실 페이로드)를 반드시 통과시킨다.
// ⚠ fetch를 주입받는다 — 네트워크 없이 요청 조립·응답 파싱을 테스트하기 위해서다.
import type { DocStatus, Party } from "../../contracts/common";
import { mapModusignStatus } from "../state-machine";
import type {
  DocumentDetail,
  SignerPort,
  SignRequestInput,
  SignRequestResult,
} from "../port";

export const MODUSIGN_BASE = "https://api.modusign.co.kr";

/** metadatas 키 — 우리 draft 역참조 (02.3 §1 준비작업 3). key는 1~40자 제한 */
const META_DRAFT_ID = "draftId";

export interface RealSignerOptions {
  apiKey: string;
  /** 템플릿 키(DocType) → 모두싸인 템플릿 ID. MODUSIGN_TEMPLATE_* env에서 온다 */
  templateIds: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  /** 재시도·타임아웃 (02.3 §5 실패 시나리오) */
  maxRetries?: number;
  timeoutMs?: number;
  /** 테스트에서 대기를 없앤다 */
  sleep?: (ms: number) => Promise<void>;
}

interface ModusignParticipant {
  id?: string;
  type?: string;
  name?: string;
}

interface ModusignSigning {
  participantId?: string;
  id?: string;
  signedAt?: string | null;
}

interface ModusignDocument {
  id: string;
  status: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  requester?: { name?: string; email?: string };
  participants?: ModusignParticipant[];
  signings?: ModusignSigning[];
  abort?: { type?: string; message?: string } | null;
  metadatas?: { key: string; value?: string }[];
}

export class ModusignSigner implements SignerPort {
  private fetchImpl: typeof fetch;
  private base: string;
  private maxRetries: number;
  private timeoutMs: number;
  private sleep: (ms: number) => Promise<void>;

  constructor(private opts: RealSignerOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = opts.baseUrl ?? MODUSIGN_BASE;
    this.maxRetries = opts.maxRetries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private authHeader(): string {
    // API Key를 Basic 자격증명으로 전달한다 (02.3 §1)
    return `Basic ${Buffer.from(`${this.opts.apiKey}:`).toString("base64")}`;
  }

  /** 429·5xx는 지수 백오프로 재시도한다. 4xx는 즉시 실패 — 재시도해도 같다 (02.3 §5) */
  private async call<T>(
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<T> {
    let lastError = "";
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(`${this.base}${path}`, {
          method: init.method,
          headers: {
            Authorization: this.authHeader(),
            "Content-Type": "application/json; charset=utf-8", // 본문은 UTF-8 필수
            Accept: "application/json",
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: controller.signal,
        });

        if (res.ok) return (await res.json()) as T;

        lastError = `${res.status} ${await res.text().catch(() => "")}`.slice(0, 300);
        const retriable = res.status === 429 || res.status >= 500;
        if (!retriable || attempt === this.maxRetries) break;
      } catch (err) {
        lastError = (err as Error).message; // 타임아웃·네트워크 — 재시도 대상
        if (attempt === this.maxRetries) break;
      } finally {
        clearTimeout(timer);
      }
      await this.sleep(2 ** attempt * 500);
    }
    // 조용히 성공으로 위장하지 않는다 (보안 7조)
    throw new Error(`[signer:modusign] ${init.method} ${path} 실패: ${lastError}`);
  }

  private templateIdFor(templateKey: string): string {
    const id = this.opts.templateIds[templateKey];
    if (!id) {
      throw new Error(
        `[signer:modusign] 템플릿 미등록: ${templateKey} — MODUSIGN_TEMPLATE_${templateKey}를 설정하세요`,
      );
    }
    return id;
  }

  private toDetail(doc: ModusignDocument): DocumentDetail {
    const signedAtOf = (p: ModusignParticipant): string | null => {
      const hit = (doc.signings ?? []).find(
        (s) => s.participantId === p.id || s.id === p.id,
      );
      return hit?.signedAt ?? null;
    };

    const parties: Party[] = [];
    if (doc.requester?.name) {
      parties.push({
        name: doc.requester.name,
        role: "REQUESTER",
        signedAt: doc.startedAt ?? null,
      });
    }
    for (const p of doc.participants ?? []) {
      parties.push({
        name: p.name ?? "참여자",
        role: "SIGNER",
        signedAt: signedAtOf(p),
      });
    }

    const status: DocStatus =
      mapModusignStatus(doc.status, doc.abort?.type) ?? "REQUESTED";

    return {
      documentId: doc.id,
      status,
      parties,
      completedAt:
        status === "COMPLETED"
          ? // 완료 시각은 마지막 서명 시각 — 없으면 갱신 시각으로 폴백
            ((doc.signings ?? [])
              .map((s) => s.signedAt)
              .filter(Boolean)
              .sort()
              .at(-1) ??
            doc.updatedAt ??
            null)
          : null,
      rejectReason: doc.abort?.message ?? null,
      metadata: Object.fromEntries(
        (doc.metadatas ?? []).map((m) => [m.key, m.value ?? ""]),
      ),
    };
  }

  async requestWithTemplate(input: SignRequestInput): Promise<SignRequestResult> {
    const doc = await this.call<ModusignDocument>("/documents/request-with-template", {
      method: "POST",
      body: {
        templateId: this.templateIdFor(input.templateKey),
        document: {
          title: `남기다 · ${input.templateKey}`,
          participantMappings: [
            {
              role: "signer",
              name: input.signerName,
              signingMethod: { type: "EMAIL", value: input.signerEmail },
            },
          ],
          // 역참조 — 웹훅이 문서 ID만 줄 때 우리 draft를 찾는 경로 (02.3 §1)
          metadatas: [{ key: META_DRAFT_ID, value: input.draftId }],
        },
      },
    });
    return { documentId: doc.id };
  }

  async createEmbeddedDraft(
    input: SignRequestInput,
  ): Promise<Required<SignRequestResult>> {
    // 임베디드 초안은 별도 엔드포인트다 — 키 도착 후 02.3 검증 게이트에서
    // 임베디드 도메인 제한과 함께 실측하고 구현한다. 조용히 링크 방식으로
    // 대체하지 않는다 (호출자가 EMBED를 요구했는데 LINK를 주면 착각이 생긴다).
    void input;
    throw new Error(
      "[signer:modusign] 임베디드 초안은 미구현입니다 — LINK 모드를 사용하세요",
    );
  }

  async getDocument(documentId: string): Promise<DocumentDetail | null> {
    try {
      return this.toDetail(
        await this.call<ModusignDocument>(`/documents/${documentId}`, { method: "GET" }),
      );
    } catch (err) {
      if ((err as Error).message.includes("404")) return null;
      throw err;
    }
  }

  async listDocuments(filter?: { status?: DocStatus }): Promise<DocumentDetail[]> {
    const res = await this.call<{ documents?: ModusignDocument[] }>("/documents", {
      method: "GET",
    });
    const all = (res.documents ?? []).map((d) => this.toDetail(d));
    return filter?.status ? all.filter((d) => d.status === filter.status) : all;
  }

  async resendNotification(documentId: string): Promise<void> {
    await this.call(`/documents/${documentId}/remind-signing`, { method: "POST" });
  }

  async cancel(documentId: string, reason: string): Promise<void> {
    // message는 2~200자 필수 — 짧으면 400이 난다
    const message = reason.trim().slice(0, 200) || "요청자가 취소했습니다.";
    await this.call(`/documents/${documentId}/cancel`, {
      method: "POST",
      body: { message, accessibleByParticipant: false },
    });
  }
}
