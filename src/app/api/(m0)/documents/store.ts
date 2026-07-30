// draft 파사드 — 기존 인터페이스를 유지하고 구현은 StorePort 뒤로 (D-18).
// route.ts가 아니므로 Next 라우트로 노출되지 않는다. M-SIGN(be2)이 여기서 draft를 읽는다.
import type { DocStatus, DocType } from "@/lib/contracts/common";
import type { GateVerdict } from "@/lib/contracts/gate";
import { store } from "@/lib/store";

export type { DraftRecord } from "@/lib/store/types";

export const createDraft = (
  intentId: string,
  docType: DocType,
  verdict: GateVerdict,
) => store.createDraft(intentId, docType, verdict);

export const getDraft = (draftId: string) => store.getDraft(draftId);

export const markDraftRequested = (draftId: string, modusignDocumentId: string) =>
  store.markDraftRequested(draftId, modusignDocumentId);

export const syncDraftStatus = (
  draftId: string,
  status: DocStatus,
  rejectReason?: string | null,
) => store.syncDraftStatus(draftId, status, rejectReason);
