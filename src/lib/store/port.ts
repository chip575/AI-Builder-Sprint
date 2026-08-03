// StorePort — 영속화 어댑터 경계 (D-18). 인메모리·Supabase가 같은 규칙을 구현한다.
// "같은 규칙"의 증명은 문서가 아니라 store-contract.ts 공유 스위트다 — 한 스위트, 두 구현.
import type { BranchOrigin, BranchType, DocStatus, DocType } from "../contracts/common";
import type { Asset, AssetCategory, Beneficiary, Custodian, DigitalDisposition } from "../contracts/estate";
import type { IntentFact } from "../contracts/extract";
import type { GateVerdict } from "../contracts/gate";
import type { LedgerNode } from "../contracts/ledger";
import type { Obligation, ObligationKind } from "../contracts/obligations";
import type { Recipient, RecipientKind, RecipientUpsertReq } from "../contracts/recipient";
import type {
  AssetWriteInput,
  BeneficiaryWriteInput,
  BranchProposalRecord,
  FamilyAckRecord,
  FamilyAckTarget,
  GateStats,
  GateVerdictRecord,
  LedgerAppendInput,
  MetricRecord,
  StageStat,
  DraftRecord,
  ProfileRecord,
  EvidenceRecord,
  HeartWillApplyResult,
  HeartWillParagraphDraft,
  HeartWillVersion,
  SessionRecord,
  Utterance,
  WebhookEventInput,
  WebhookEventRecord,
} from "./types";

export interface StorePort {
  // ── 세션(intent) ──────────────────────────────────────────
  getOrCreateSession(sessionId?: string | null, userId?: string): Promise<SessionRecord>;
  getSession(sessionId: string): Promise<SessionRecord | undefined>;
  addUtterance(sessionId: string, text: string): Promise<Utterance>;
  /** 원문 수정 API는 존재하지 않는다 (FR-111). 삭제는 단방향 소프트 삭제만 —
   *  이미 삭제된 발화면 false (번복·재삭제 불가, D-10) */
  softDeleteUtterance(utteranceId: string): Promise<boolean>;
  addProposal(
    sessionId: string,
    branchType: BranchType,
    origin: BranchOrigin,
    sourceUtteranceId: string,
  ): Promise<BranchProposalRecord>;
  /** 제안에 대한 사용자의 결정을 **영속화**한다 (FR-115A).
   *  메모리에만 두면 인스턴스가 갈릴 때 거절했던 가지가 다시 제안된다 —
   *  사용자에게는 거절이 무시된 것으로 보인다 */
  decideProposal(
    proposalId: string,
    status: "OPENED" | "PENDING_RECONFIRM" | "DECLINED" | "DEFERRED",
  ): Promise<BranchProposalRecord | undefined>;
  /** 제안 1건 — 결정 라우트가 무게·출처를 알아야 상태를 정할 수 있다 */
  getProposal(
    proposalId: string,
  ): Promise<(BranchProposalRecord & { sessionId: string; userId: string }) | undefined>;
  /** 이 **사람**이 닫은(DECLINED) 가지 종류. 재제안 금지 판정에 쓴다.
   *  ⚠ 세션 단위가 아니다 — 다른 세션에서 되살아나면 "닫았다"는 말이 무의미해진다 (FR-115A) */
  listDeclinedBranchesByUser(userId: string): Promise<BranchType[]>;

  // ── facts ─────────────────────────────────────────────────
  /** UPSERT (intent_id, key) — 단, confirmed=true 행은 덮지 않는다 (P1의 DB 방어).
   *  확정값 변경은 patchFactValue(사용자 행위)만. 반환은 방어 적용 후의 유효 facts */
  saveFacts(sessionId: string, facts: IntentFact[]): Promise<IntentFact[]>;
  findFact(
    factId: string,
  ): Promise<{ session: SessionRecord; fact: IntentFact } | undefined>;
  /** 사용자 편집 — confidence=1, confirmed=false(재확정 필요)로 갱신 */
  patchFactValue(
    factId: string,
    value: IntentFact["value"],
  ): Promise<IntentFact | undefined>;
  /** 전체 일괄 확정 — 확정 경로는 이것뿐 (FR-103). 이번에 확정된 수 반환 */
  confirmFacts(sessionId: string): Promise<number>;

  // ── drafts ────────────────────────────────────────────────
  createDraft(
    intentId: string,
    docType: DocType,
    verdict: GateVerdict,
  ): Promise<DraftRecord>;
  getDraft(draftId: string): Promise<DraftRecord | undefined>;
  /** 웹훅 역참조 — 모두싸인 문서 ID로 draft를 찾는다 (02.3 §1) */
  findDraftByDocumentId(modusignDocumentId: string): Promise<DraftRecord | undefined>;
  markDraftRequested(draftId: string, modusignDocumentId: string): Promise<void>;
  syncDraftStatus(
    draftId: string,
    status: DocStatus,
    rejectReason?: string | null,
  ): Promise<void>;

  // ── webhook events (아웃박스) ─────────────────────────────
  /** ON CONFLICT DO NOTHING — 중복이면 버린다(멱등). facts의 DO UPDATE와
   *  구문은 쌍둥이지만 의도는 정반대다: 여기서 중복은 노이즈, 거기서 중복은 정정.
   *  하나를 보고 다른 하나를 "통일"하지 말 것. */
  insertWebhookEvent(input: WebhookEventInput): Promise<"INSERTED" | "DUPLICATE">;
  listUnprocessedEvents(): Promise<WebhookEventRecord[]>;
  markEventProcessed(id: number): Promise<void>;

  // ── gate verdicts (FR-509 · NFR-709) ──────────────────────
  /** 판정 이력 기록. 3분기 전부 남긴다 — 분포 화면의 근거.
   *  ⚠ 기록 실패가 본 흐름을 막으면 안 된다 — 호출부가 삼킨다 (관측이 기능을 죽이지 않는다) */
  recordGateVerdict(input: GateVerdictRecord): Promise<void>;
  getGateStats(): Promise<GateStats>;

  // ── pipeline metrics (NFR-709) ────────────────────────────
  /** 적재 실패가 본 흐름을 막으면 안 된다 — 호출부가 삼킨다 */
  recordMetric(input: MetricRecord): Promise<void>;
  getPipelineStats(): Promise<StageStat[]>;

  // ── reconciler (FR-504) ───────────────────────────────────
  /** 진행 중인데 오래 갱신되지 않은 draft — 웹훅 유실 후보 */
  listStaleRequestedDrafts(olderThanMs: number): Promise<DraftRecord[]>;
  /**
   * 이 **사람**의 문서 목록 (서류 이력 화면).
   *
   * userId를 선택 인자로 두지 않는다 — 빠뜨리면 전체가 나오는 시그니처는 언젠가
   * 빠뜨린다. listLedgerNodes(subjectId)와 같은 규약이다 (D-18: 열어주지 않으면 닫혀 있다).
   * document_drafts에는 소유자 열이 없으므로 어댑터가 intents를 조인해 거른다.
   */
  /** 마이페이지 값 — 없으면 undefined. 서식에 인쇄될 성명·연락처를 여기서 읽는다 */
  getProfile(userId: string): Promise<ProfileRecord | undefined>;
  /** 부분 수정. 보내지 않은 항목은 그대로 둔다 */
  saveProfile(userId: string, patch: Partial<Omit<ProfileRecord, "userId">>): Promise<ProfileRecord>;

  /** 알릴 상대 — 기관·유가족·지킴이 (FR-405 · FR-112).
   *  계약 넷(Beneficiary·Custodian·FamilyAck·DeliveryPatch)의 recipientId가 가리키던 실체다.
   *  ⚠ 이메일은 개인정보라 audit·로그에 원문을 남기지 않는다 (보안 1조) */
  listRecipients(userId: string, kind?: RecipientKind): Promise<Recipient[]>;
  /** id가 있으면 수정, 없으면 생성. 같은 (역할·이메일)이 이미 있으면 그것을 고친다 —
   *  중복 등록은 통지를 두 번 보내는 결과가 된다 */
  upsertRecipient(userId: string, input: RecipientUpsertReq): Promise<Recipient>;
  /** 남의 것을 지우지 않도록 userId를 함께 받는다. 없으면 false */
  deleteRecipient(userId: string, id: string): Promise<boolean>;

  /** 지킴이 (FR-405 · NFR-713).
   *  ⚠ 열람 권한의 기준은 `grantedAt`이지 status가 아니다 — 서명 완료 웹훅만 채운다.
   *    PENDING = 열람 0건이고, 그것이 기본값이라 조용히 열리는 경로가 없다 */
  /** 이미 있는 자산 고치기 (FR-401 · FR-403).
   *  남의 것을 고치지 않도록 userId를 함께 받는다. 없으면 undefined.
   *  ⚠ confirmed는 **올리기만** 한다 — 내리는 것은 값이 바뀔 때 서버가 하는 일이다 (P1) */
  updateAsset(
    userId: string,
    assetId: string,
    patch: {
      disposition?: DigitalDisposition | null;
      confirmed?: true;
      beneficiaryId?: string | null;
      story?: string | null;
    },
  ): Promise<Asset | undefined>;

  listCustodians(userId: string): Promise<Custodian[]>;
  /** 같은 상대를 두 번 지정하지 않는다 — 재초대는 상태 갱신이다 (DB unique) */
  upsertCustodian(
    userId: string,
    input: { recipientId: string; displayName: string; viewScope: AssetCategory[]; agreementDraftId?: string | null },
  ): Promise<Custodian>;
  /** 서명 완료 — 이때만 열람이 열린다 */
  grantCustodian(agreementDraftId: string): Promise<Custodian | undefined>;
  /** 권한 회수. 남의 것을 거두지 않도록 userId를 함께 받는다 */
  revokeCustodian(userId: string, id: string): Promise<boolean>;

  listDocumentsByUser(
    userId: string,
    filter?: { docType?: DocType; status?: DocStatus; from?: string; to?: string },
  ): Promise<DraftRecord[]>;
  /** 상태별 문서 건수 — 기관 대시보드 (FR-601) */
  countDraftsByStatus(): Promise<Record<string, number>>;
  recordReconcile(corrected: number): Promise<void>;
  getReconcileState(): Promise<{ lastSyncAt: string | null; correctedTotal: number }>;

  /** 감사 로그 append (FR-556 열람 기록 등).
   *  ⚠ 기록 실패가 본 흐름을 막으면 안 된다 — 호출부가 삼킨다 */
  recordAudit(action: string, subject: string, detail?: unknown): Promise<void>;
  /** 같은 (action, subject)의 누적 횟수와 마지막 시각.
   *  리마인드 재발송 간격 판정에 쓴다 — 프로세스 사본으로 세면 인스턴스가 갈릴 때
   *  간격이 초기화돼 **연속 발송**이 열린다. 독촉 금지는 영속 값으로 지켜야 한다 (FR-113) */
  getAuditSummary(
    action: string,
    subject: string,
  ): Promise<{ count: number; lastAt: string | null }>;

  // ── mock signer 외부 상태 (MODUSIGN_MODE=mock 전용) ───────
  /** 서버리스는 요청마다 인스턴스가 갈린다. mock이 대역하는 "외부 세계"를 인메모리로만
   *  두면 서명 요청은 A에서, 완료 시뮬은 B에서 처리되어 문서를 잃는다.
   *  ⚠ **draft와 분리된 자리**여야 한다 — 같은 자리에 쓰면 우리 기록이 함께 움직여
   *  "웹훅 유실"(외부만 완료, 우리는 REQUESTED)을 재현할 수 없다. */
  putMockDoc(documentId: string, state: Record<string, unknown>): Promise<void>;
  getMockDoc(documentId: string): Promise<Record<string, unknown> | undefined>;

  // ── 마음 유언 (FR-111) ────────────────────────────────────
  /** 문단 초안을 현재 버전에 **미승인 상태로** 쌓는다. 문서 본문은 아직 그대로다.
   *  근거 발화가 없거나 이 세션의 살아있는 발화가 아니면 **거부한다** — 스키마의
   *  `source_utterance_id NOT NULL` + FK를 코드에서도 세운다 (AI가 지어낸 문장의 자리를 없앤다) */
  draftHeartWillParagraphs(
    sessionId: string,
    drafts: HeartWillParagraphDraft[],
  ): Promise<HeartWillVersion>;
  /** 현재 버전. 문서가 아직 없으면 undefined (초안조차 쌓인 적 없는 상태) */
  getHeartWillHead(sessionId: string): Promise<HeartWillVersion | undefined>;
  /** 승인된 문단만 담아 새 버전을 잇는다 (append-only 체인).
   *  ⚠ 승인이 하나도 없으면 **버전을 만들지 않고 null**이다 — 빈 승인은 "갱신 없음"이지
   *  "전부 승인"이 아니다 (P1). 같은 발화를 근거로 새로 승인된 문단은 옛 문단을 대체한다 */
  applyHeartWill(
    sessionId: string,
    acceptedParagraphIds: string[],
  ): Promise<HeartWillApplyResult | null>;
  // ── intent ledger (FR-550~555) ────────────────────────────
  /** append-only. UPDATE·DELETE는 존재하지 않는다 — 정정도 새 노드다.
   *  seq와 해시는 어댑터가 꼬리를 읽어 계산한다 (lib/ledger/chain.buildNode) */
  appendLedgerNode(input: LedgerAppendInput): Promise<LedgerNode>;
  /** seq 오름차순. status는 저장값이 아니라 유도값으로 내보낸다 (FR-555 최신성) */
  listLedgerNodes(subjectId: string): Promise<LedgerNode[]>;
  /** 노드 1건 — 가족 인지 요청이 대상 노드를 확인할 때 쓴다 */
  getLedgerNode(nodeId: string): Promise<LedgerNode | undefined>;


  // ── 가족 인지 (FR-554) ────────────────────────────────────
  /** 통지 대상에게 인지 요청을 남긴다. **빈 배열이면 아무것도 만들지 않는다** —
   *  알리지 않을 자유가 본인에게 있고, 요청 0건은 결함이 아니다 (P4) */
  requestFamilyAcks(
    ledgerNodeId: string,
    targets: (FamilyAckTarget & { documentId: string | null })[],
  ): Promise<FamilyAckRecord[]>;
  listFamilyAcks(ledgerNodeId: string): Promise<FamilyAckRecord[]>;
  /** 웹훅이 문서 id로 역참조해 응답을 채운다 — 응답 경로가 서명 하나뿐이라
   *  "가족이 눌렀다"는 주장에 서명이라는 근거가 항상 붙는다 */
  resolveFamilyAck(
    documentId: string,
    status: "ACKNOWLEDGED" | "DECLINED",
    declinedReason?: string | null,
  ): Promise<FamilyAckRecord | undefined>;

  // ── 임베딩 (02.5 §3 · D-07) ───────────────────────────────
  /** 발화 벡터 적재 — 세션 종료 시 배치로만 부른다 (대화 중 실시간 호출 금지, 비용 가드).
   *  이미 있는 발화는 건너뛴다 — 재적재는 같은 벡터를 다시 사는 일이다 */
  saveEmbeddings(
    intentId: string,
    rows: { utteranceId: string; vector: number[] }[],
  ): Promise<number>;
  /** 아직 벡터가 없는 발화 — 배치 대상. 소프트 삭제된 발화는 제외된다 */
  listUnembeddedUtterances(
    intentId: string,
  ): Promise<{ utteranceId: string; text: string }[]>;
  /** 유사도 상위 k. **소프트 삭제된 발화는 결과에서 빠진다** —
   *  지운 이야기가 검색으로 되살아나면 삭제권이 무의미해진다 (D-10) */
  searchSimilarUtterances(
    intentId: string,
    queryVector: number[],
    k: number,
  ): Promise<{ utteranceId: string; sessionId: string; text: string; spokenAt: string; score: number }[]>;

  // ── obligations (FR-204 · FR-508) ─────────────────────────
  /** 이행 약속 1건. 같은 (kind, subjectId)로 아직 발화되지 않은 게 있으면 만들지 않는다 —
   *  같은 갱신을 두 번 알리면 그건 안내가 아니라 독촉이 된다 (FR-113) */
  createObligation(input: {
    kind: ObligationKind;
    subjectId: string;
    dueAt: string;
  }): Promise<Obligation | undefined>;
  /** 기한이 지났고 아직 발화되지 않은 것들 */
  listDueObligations(now: string): Promise<Obligation[]>;
  markObligationFired(id: string, firedAt: string): Promise<void>;
  listObligations(subjectId?: string): Promise<Obligation[]>;
  /** 시간 압축 — 미발화 약속의 기한을 당긴다 (NFR-707).
   *  가짜 시계를 만들지 않는다. 스케줄러·상태머신은 실제 그대로 돈다 */
  shiftObligationDueDates(months: number): Promise<number>;

  // ── 자산정리 (FR-401 · FR-402 · FR-404) ───────────────────
  /** 자산 1건 적재. **확인 여부와 마스킹은 어댑터가 정한다** —
   *  OCR 산출물은 confirmed=false로 시작하고(P1), 본인이 직접 쓴 값은 그 입력 자체가
   *  확인이다. 식별번호는 저장 직전 다시 마스킹된다 (NFR-712) */
  createAsset(input: AssetWriteInput): Promise<Asset>;
  /** 본인 소유분 전량. 정렬은 등록 순 — 화면의 카테고리 정렬은 집계 계층이 한다 */
  listAssets(userId: string): Promise<Asset[]>;

  createBeneficiary(input: BeneficiaryWriteInput): Promise<Beneficiary>;
  listBeneficiaries(userId: string): Promise<Beneficiary[]>;

  // ── evidences ─────────────────────────────────────────────
  createEvidence(
    input: Omit<EvidenceRecord, "id" | "createdAt">,
  ): Promise<EvidenceRecord>;
  getEvidenceByDraft(draftId: string): Promise<EvidenceRecord | undefined>;
}
