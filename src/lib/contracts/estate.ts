// M-ESTATE — 자산정리 가지 (FR-401~405 · BranchType.ESTATE)
// 채무는 별도 엔티티가 아니라 Asset의 한 category다. 상속은 채무도 승계하므로
// 목록을 분리하면 한정승인 안내(FR-402)가 두 목록을 가로질러야 한다.
// 식별번호는 maskedIdentifier만 존재한다 — 이 파일에 원문 필드는 없다 (NFR-712).
import { z } from "zod";
import { GateVerdictCode, Statute } from "./gate";

/** 7종 고정 (FR-402). 배열 순서가 인벤토리 화면의 표시 순서다. */
export const AssetCategory = z.enum([
  "REAL_ESTATE", // 부동산
  "FINANCIAL",   // 금융 (예금·적금)
  "INSURANCE",   // 보험
  "SECURITIES",  // 증권
  "DEBT",        // 채무 — 자산의 한 종류로 둔다 (상속은 채무도 승계한다)
  "BELONGINGS",  // 물건(유품)
  "DIGITAL",     // 디지털 자산 (구독·클라우드·SNS)
]);
export type AssetCategory = z.infer<typeof AssetCategory>;

/** DIGITAL을 뺀 6종 — 처리 지시가 필수가 아닌 카테고리 */
export const NonDigitalCategory = AssetCategory.exclude(["DIGITAL"]);
export type NonDigitalCategory = z.infer<typeof NonDigitalCategory>;

/** 값의 출처. OCR이든 수기든 마스킹은 동일하게 적용된다 (NFR-712) */
export const AssetOrigin = z.enum(["OCR", "MANUAL"]);
export type AssetOrigin = z.infer<typeof AssetOrigin>;

/** 디지털 유산 처리 방식 (FR-403). 이전(TRANSFER)은 대상 없이 성립하지 않는다. */
export const DigitalDisposition = z.discriminatedUnion("action", [
  z.object({ action: z.literal("DELETE"), note: z.string().nullish() }),
  z.object({ action: z.literal("PRESERVE"), note: z.string().nullish() }),
  z.object({
    action: z.literal("TRANSFER"),
    toBeneficiaryId: z.string().uuid(),
    note: z.string().nullish(),
  }),
]);
export type DigitalDisposition = z.infer<typeof DigitalDisposition>;

const AssetBase = z.object({
  id: z.string().uuid(),
  /** 표시명 — "○○동 아파트". 소재지 원문·계좌 원문은 넣지 않는다 */
  label: z.string(),
  /** 등기·계좌·증권번호는 마스킹 값만. 서버가 저장 직전에 변환한다 (NFR-712) */
  maskedIdentifier: z.string().nullish(),
  /** 본인 신고 추정액. 부호 없는 크기다 — 채무도 양수로 담고 합산에서 분리한다.
   *  상속세·유류분 계산에 쓰지 않는다 (FR-304 "금액 계산은 하지 않음") */
  estimatedValueKrw: z.number().nonnegative().nullish(),
  origin: AssetOrigin,
  /** 추출 신뢰도 — 낮은 항목을 화면에서 강조한다 (FR-401). 수기 입력은 null */
  confidence: z.number().min(0).max(1).nullish(),
  /** OCR 산출물은 confirmed=false로 시작한다 (P1) */
  confirmed: z.boolean(),
  /** 수증자 매핑 (FR-404). 미지정 허용 */
  beneficiaryId: z.string().uuid().nullish(),
  /** "왜 그 사람에게 주는지" 한 문단 — 선택이다. 비어 있어도 저장된다 (FR-404) */
  story: z.string().nullish(),
  /** M-PAPER-SCAN 업로드 참조. 원본 파일 경로는 담지 않는다 (보안 3조) */
  sourceUploadId: z.string().uuid().nullish(),
});

/** 디지털 자산 — 처리 지시가 필수다. 비운 채로는 스키마를 통과하지 못한다 (FR-403) */
export const DigitalAsset = AssetBase.extend({
  category: z.literal("DIGITAL"),
  disposition: DigitalDisposition,
});
export type DigitalAsset = z.infer<typeof DigitalAsset>;

export const NonDigitalAsset = AssetBase.extend({
  category: NonDigitalCategory,
});
export type NonDigitalAsset = z.infer<typeof NonDigitalAsset>;

/** 처리 지시의 필수 여부가 카테고리에 달려 있으므로 union이다.
 *  런타임 파싱 실패가 곧 FR-403의 "비워둘 수 없다" 강제다 — UI 검증에 의존하지 않는다. */
export const Asset = z.discriminatedUnion("category", [DigitalAsset, NonDigitalAsset]);
export type Asset = z.infer<typeof Asset>;

/** 생성·수정 입력. 서버 소유 필드(id·confirmed·confidence·origin)는 클라이언트가 보내지 않는다. */
export const AssetUpsertReq = z.discriminatedUnion("category", [
  DigitalAsset.omit({ id: true, confirmed: true, confidence: true, origin: true }),
  NonDigitalAsset.omit({ id: true, confirmed: true, confidence: true, origin: true }),
]);
export type AssetUpsertReq = z.infer<typeof AssetUpsertReq>;

/** 이미 있는 자산 고치기 (FR-401 · FR-403).
 *  ⚠ 종류(category)와 이름(label)은 여기서 바꾸지 않는다 — 바꾸면 다른 자산이다.
 *    잘못 넣으셨으면 지우고 새로 넣는 편이 이력이 정직하다.
 *  ⚠ `confirmed`는 **true만 받는다.** 확정을 되돌리는 것은 사용자의 일이 아니라
 *    값이 바뀔 때 서버가 하는 일이다 (P1) — 여기서 false를 허용하면 확정 이력이
 *    사용자 손으로 지워진다. */
export const AssetPatchReq = z.object({
  /** 디지털 자산의 처리 방식. 계약이 "이전에는 받을 사람이 있다"까지 강제하고,
   *  그 사람이 실재하는지는 라우트가 본다 */
  disposition: DigitalDisposition.nullish(),
  confirmed: z.literal(true).optional(),
  beneficiaryId: z.string().uuid().nullish(),
  story: z.string().max(500).nullish(),
});
export type AssetPatchReq = z.infer<typeof AssetPatchReq>;

/** 수증자. 연락처·주소·식별번호를 담지 않는다 — 통지가 필요하면 recipientId로 참조한다
 *  (heartwill DeliveryPatch·FamilyAckReq의 recipientIds와 같은 규약) */
export const Beneficiary = z.object({
  id: z.string().uuid(),
  name: z.string(),
  /** "장녀", "조카" — 표시용이다. 법정상속분 판정에 쓰지 않는다 */
  relation: z.string(),
  recipientId: z.string().uuid().nullish(),
});
export type Beneficiary = z.infer<typeof Beneficiary>;

export const BeneficiaryUpsertReq = Beneficiary.omit({ id: true });
export type BeneficiaryUpsertReq = z.infer<typeof BeneficiaryUpsertReq>;

/** PENDING = 열람 0건. 서명 완료 웹훅만 ACTIVE로 올린다 (FR-405) */
export const CustodianStatus = z.enum(["PENDING", "ACTIVE", "REVOKED"]);
export type CustodianStatus = z.infer<typeof CustodianStatus>;

/** Custodian은 유언집행자가 아니다 (00.2 §7.1 · D-09). UI 표기는 "지킴이".
 *  약정서 본문의 고지 문구는 템플릿 소관이고, 여기는 권한의 모양만 정한다. */
export const Custodian = z.object({
  id: z.string().uuid(),
  recipientId: z.string().uuid(),
  displayName: z.string(),
  /** 카테고리 단위 부분 열람 (NFR-713). 빈 배열이 기본값이고, 그것이 최소 권한이다 */
  viewScope: z.array(AssetCategory),
  status: CustodianStatus,
  /** CUSTODIAN_AGREEMENT 초안 — 게이트 ESIGN_OK (validity-gate.ts에 이미 있는 행) */
  agreementDraftId: z.string().uuid().nullish(),
  /** 서명 완료 시각. null이면 열람 권한이 없다 — 서버가 이 값으로 판정한다 (FR-405) */
  grantedAt: z.string().datetime().nullish(),
  revokedAt: z.string().datetime().nullish(),
});
export type Custodian = z.infer<typeof Custodian>;

export const CustodianInviteReq = z.object({
  recipientId: z.string().uuid(),
  displayName: z.string(),
  viewScope: z.array(AssetCategory),
});
export type CustodianInviteReq = z.infer<typeof CustodianInviteReq>;

export const CustodianInviteRes = z.object({
  custodian: Custodian,
  /** 서명 요청 자체는 M-SIGN을 그대로 재사용한다 — 여기서 URL을 반환하지 않는다 (보안 3조) */
  draftId: z.string().uuid(),
});
export type CustodianInviteRes = z.infer<typeof CustodianInviteRes>;

export const CustodianScopePatch = z.object({
  viewScope: z.array(AssetCategory),
});
export type CustodianScopePatch = z.infer<typeof CustodianScopePatch>;

/** 열람 범위 변경은 약정서 본문의 변경이므로 MATERIAL → 재서명 대상 (NFR-713).
 *  판정은 lib/ledger가 하고, 여기는 결과만 싣는다. */
export const CustodianScopePatchRes = z.object({
  custodian: Custodian,
  requiresResign: z.boolean(),
  ledgerNodeId: z.string().uuid().nullish(),
});
export type CustodianScopePatchRes = z.infer<typeof CustodianScopePatchRes>;

export const CategoryRollup = z.object({
  category: AssetCategory,
  count: z.number().int().nonnegative(),
  /** 금액 미상 항목이 하나라도 섞이면 null — 부분 합계를 전체인 척 보여주지 않는다 */
  estimatedTotalKrw: z.number().nonnegative().nullable(),
});
export type CategoryRollup = z.infer<typeof CategoryRollup>;

export const InventorySummary = z.object({
  totalCount: z.number().int().nonnegative(),
  byCategory: z.array(CategoryRollup),
  /** 확인 유도 대상 (FR-401 · P1) */
  unconfirmedCount: z.number().int().nonnegative(),
  lowConfidenceCount: z.number().int().nonnegative(),
  hasDebt: z.boolean(),
  /** 상속포기·한정승인 안내 (FR-402). 기간 수치는 lib/rules가 Statute로 채운다 —
   *  이 파일에 숫자를 쓰지 않는다 (절대규칙 2) */
  debtNotice: z.array(Statute).nullish(),
});
export type InventorySummary = z.infer<typeof InventorySummary>;

export const InventoryRes = z.object({
  assets: z.array(Asset),
  beneficiaries: z.array(Beneficiary),
  summary: InventorySummary,
  /** 본인 조회는 null. Custodian 조회면 실제 적용된 범위를 명시한다 —
   *  필터가 걸렸다는 사실이 응답에 남아야 누락을 테스트로 잡을 수 있다 (NFR-713) */
  scopeApplied: z.array(AssetCategory).nullish(),
});
export type InventoryRes = z.infer<typeof InventoryRes>;

/** 디지털 유산 처리 지시서 (FR-403) — 서명 없이 보관되는 문서.
 *  DocType은 DIGITAL_LEGACY_INSTRUCTION이고 게이트가 NON_BINDING을 반환한다
 *  (common.ts·validity-gate.ts에 2026-07-31 함께 추가). verdict는 그 값만 유효하다. */
export const DigitalLegacyInstructionRes = z.object({
  documentId: z.string().uuid(),
  verdict: GateVerdictCode,
  items: z.array(
    z.object({
      assetId: z.string().uuid(),
      label: z.string(),
      disposition: DigitalDisposition,
    }),
  ),
});
export type DigitalLegacyInstructionRes = z.infer<typeof DigitalLegacyInstructionRes>;
