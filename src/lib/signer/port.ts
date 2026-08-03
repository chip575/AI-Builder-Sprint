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
  /** 서식에 인쇄될 값 (우리 키 기준). 어댑터가 콘솔 dataLabel로 번역한다 —
   *  번역은 어댑터의 일이지 호출부의 일이 아니다 */
  fields?: Record<string, unknown>;
  /** 두 번째 서명자 — 역할이 2인인 서식에만 쓴다 (FAMILY_ACK · REVOCATION_NOTICE).
   *  ⚠ **상대가 서명하지 않으면 문서가 완료되지 않는다.** 그 미완료가 결함이 아니라
   *  사실인 서식에만 붙인다: 철회 통지서에서 기관 서명은 수령 확인이고, 안 해도
   *  철회는 성립한다 (서식 제2조). 없으면 1인으로 나간다 */
  counterparty?: { name: string; email: string } | null;
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
  /** 외부 기준 마지막 갱신 시각 (ISO). 델타 조회의 기준점이다 — 없으면 null */
  updatedAt?: string | null;
}

/** 목록 조회 조건. 모두싸인 filter 문법으로 번역되는 것은 어댑터의 일이다 */
export interface DocumentListFilter {
  status?: DocStatus;
  /** 이 시각 이후 갱신된 것만 (ISO). 리컨실러의 N회 조회를 1회로 줄인다 */
  updatedSince?: string | null;
  /** 한 번에 가져올 최대 건수 (모두싸인 상한 100) */
  limit?: number;
}

export interface SignerPort {
  requestWithTemplate(input: SignRequestInput): Promise<SignRequestResult>;
  createEmbeddedDraft(input: SignRequestInput): Promise<Required<SignRequestResult>>;
  getDocument(documentId: string): Promise<DocumentDetail | null>;
  listDocuments(filter?: DocumentListFilter): Promise<DocumentDetail[]>;
  resendNotification(documentId: string): Promise<void>;
  cancel(documentId: string, reason: string): Promise<void>;
}
