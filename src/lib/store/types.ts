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
