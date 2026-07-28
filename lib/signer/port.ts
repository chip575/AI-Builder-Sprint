// SignerPort — 모두싸인 어댑터 경계 (ADR-4 · spec/plan/02.3-modusign.md §2)
// real/mock이 이 인터페이스를 공유한다. 호출부는 어느 쪽인지 모른다.
import type { DocStatus, Party } from "../contracts/common";

export interface SignRequestInput {
  /** MODUSIGN_TEMPLATE_* env 키의 접미사 (예: "DONATION_PLEDGE") */
  templateKey: string;
  /** 내부 역참조 — metadata.draftId로 심는다 (02.3 §1 준비작업 3) */
  draftId: string;
  signerName: string;
  signerEmail: string;
}

export interface SignRequestResult {
  documentId: string;
  embeddedUrl?: string;
  expiresAt?: string; // ISO — 임베디드 URL은 2시간 만료 (FR-502)
}

export interface DocumentDetail {
  documentId: string;
  status: DocStatus;
  parties: Party[];
  completedAt: string | null;
  rejectReason: string | null;
  metadata: Record<string, string>;
}

export interface SignerPort {
  requestWithTemplate(input: SignRequestInput): Promise<SignRequestResult>;
  createEmbeddedDraft(input: SignRequestInput): Promise<Required<SignRequestResult>>;
  getDocument(documentId: string): Promise<DocumentDetail | null>;
  listDocuments(filter?: { status?: DocStatus }): Promise<DocumentDetail[]>;
  resendNotification(documentId: string): Promise<void>;
  cancel(documentId: string, reason: string): Promise<void>;
}
