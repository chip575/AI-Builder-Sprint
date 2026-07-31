// 저장소 레코드 타입 — 인메모리·Supabase 두 구현이 공유한다.
// 스키마 컬럼명(snake_case)과 코드 필드명(camelCase)의 번역은 어댑터가 한다.
import type {
  BranchOrigin,
  BranchType,
  DocStatus,
  DocType,
} from "../contracts/common";
import type { IntentFact } from "../contracts/extract";
import type { GateVerdict } from "../contracts/gate";
import type { LedgerNodeReq, Materiality } from "../contracts/ledger";

/** dev·인메모리 경로의 user_id — NULL 대신 이 값 (0002가 SET NOT NULL 한 줄로 끝나게) */
export const DEV_USER_ID = "00000000-0000-4000-8000-0000000000de";

export interface Utterance {
  id: string;
  text: string;
  at: string;
  deletedAt?: string | null;
}

export interface BranchProposalRecord {
  id: string;
  branchType: BranchType;
  origin: BranchOrigin;
  sourceUtteranceId: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  utterances: Utterance[]; // deletedAt IS NULL만 (삭제분은 조회 계층에서 걸러짐)
  proposals: BranchProposalRecord[];
  facts: IntentFact[];
  /** 전 fact 확정 시각. null이면 미확정 — 확정 여부의 진실은 서버가 소유한다 */
  confirmedAt: string | null;
  startedAt: string;
}

export interface DraftRecord {
  draftId: string;
  intentId: string;
  docType: DocType;
  verdict: GateVerdict;
  pdfUrl: string;
  status: DocStatus;
  modusignDocumentId?: string | null;
  rejectReason?: string | null;
  createdAt: string;
}

export interface WebhookEventInput {
  externalEventId: string;
  event: string;
  modusignDocumentId?: string | null;
  payload: unknown;
}

export interface WebhookEventRecord extends WebhookEventInput {
  id: number;
  receivedAt: string;
  processedAt: string | null;
}

export interface EvidenceRecord {
  id: string;
  draftId: string;
  pdfStoragePath: string;
  sha256: string;
  signedAt: string;
  parties: unknown;
  createdAt: string;
}

// ── 마음 유언 (FR-111) ──────────────────────────────────────
// 문단이 단위다. 버전을 통짜 텍스트로 두지 않는다 — 승인·근거 연결·AI/사용자 구분이
// 전부 문단 단위이기 때문이다 (20260730160227_heartwill.sql의 설계 결정 [1]).

/** 문단의 출처. 화면이 AI 문장과 사용자 문장을 다르게 보이게 하는 근거다 (P1의 화면 증거).
 *  USER_EDITED는 AI 초안을 사용자가 고친 것 — 고친 순간 사용자의 문장이 된다 */
export type HeartWillOrigin = "AI_DRAFT" | "USER_EDITED" | "USER_WRITTEN";

/** 적재 요청. sourceUtteranceId는 선택항목이 아니다 — 근거 없는 문단은 만들 수 없다 */
export interface HeartWillParagraphDraft {
  body: string;
  origin: HeartWillOrigin;
  sourceUtteranceId: string;
}

export interface HeartWillParagraph extends HeartWillParagraphDraft {
  id: string;
  ord: number;
  /** null이면 미승인 — 문서 본문이 아니다. **기본값이 미승인**이라 조용히 반영되는 경로가 없다 (P1) */
  acceptedAt: string | null;
  createdAt: string;
}

/** 버전 = 문서의 한 스냅샷. paragraphs에는 본문(acceptedAt≠null)과
 *  아직 승인을 기다리는 초안(acceptedAt=null)이 함께 있다 — acceptedAt이 둘을 가른다 */
export interface HeartWillVersion {
  versionId: string;
  documentId: string;
  prevVersionId: string | null;
  paragraphs: HeartWillParagraph[];
  createdAt: string;
}

/** 새 버전 + 직전 버전의 **본문**(승인 문단만).
 *  diff 계산은 두 어댑터에 같은 로직을 심지 않으려고 호출부(라우트)로 뺐다 */
export interface HeartWillApplyResult {
  version: HeartWillVersion;
  previousParagraphs: HeartWillParagraph[];
}

/** 원장 노드 추가 입력 (FR-550~553).
 *  seq·prevHash·nodeHash는 여기에 없다 — 꼬리를 읽어야 정해지므로 어댑터가
 *  lib/ledger/chain의 buildNode에 맡긴다. 호출자가 해시를 들고 오면 그 순간
 *  "누가 계산했는지"가 갈려 체인이 증거이길 그만둔다. */
export interface LedgerAppendInput extends LedgerNodeReq {
  materiality: Materiality;
  /** MATERIAL일 때 의사 확인서 draft (FR-552). 재서명 흐름은 M3 범위 밖 — 지금은 null */
  draftId?: string | null;
}

/** 게이트 판정 1건의 기록 (FR-509) */
export interface GateVerdictRecord {
  docType: string;
  verdict: "ESIGN_OK" | "ESIGN_INVALID" | "NON_BINDING";
  /** 서명 경로에서 막혔는가 — 문서 생성 단계 거부는 false, sign 재검증 차단은 true */
  wasSignAttempt: boolean;
  statutes: { id: string }[];
}

export interface GateStats {
  blockedTotal: number;
  byDocType: Record<string, number>;
  byStatute: { id: string; count: number }[];
  byVerdict: Record<string, number>;
  totalEvaluations: number;
}

/** 파이프라인 실행 지표 1건 (NFR-709) */
export interface MetricRecord {
  stage: string;
  ok: boolean;
  ms: number;
}

export interface StageStat {
  stage: string;
  success: number;
  fail: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

/** 가족 인지 요청 1건 (FR-554).
 *  `ack`(인지)이지 `consent`(동의)가 아니다 — 거부해도 본인 확인서는 그대로다.
 *  documentId는 서명 서비스가 준 문서 id — 웹훅이 이걸로 역참조해 상태를 채운다 */
export interface FamilyAckRecord {
  id: string;
  ledgerNodeId: string;
  recipientId: string;
  recipientName: string | null;
  relation: string | null;
  status: "PENDING" | "ACKNOWLEDGED" | "DECLINED";
  documentId: string | null;
  notifiedAt: string;
  signedAt: string | null;
  declinedReason: string | null;
}

/** 통지 대상 지정 — 본인이 고른다. 빈 배열이면 아무에게도 알리지 않는다 (P4) */
export interface FamilyAckTarget {
  recipientId: string;
  recipientName?: string | null;
  relation?: string | null;
}

