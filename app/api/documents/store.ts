// M-DOCUMENTS — 인메모리 draft 저장소 (M0 관통용, Supabase 영속화 시 구현만 교체)
// route.ts가 아니므로 Next 라우트로 노출되지 않는다. M-SIGN(be2)이 여기서 draft를 읽는다.
import { randomUUID } from "node:crypto";
import type { DocStatus, DocType } from "../../../lib/contracts/common";
import type { GateVerdict } from "../../../lib/contracts/gate";

export interface DraftRecord {
  draftId: string;
  intentId: string;
  docType: DocType;
  /** 게이트 판정 원본 — 서명 요청 시 재검증에 쓴다 (FR-104 "UI 우회 불가") */
  verdict: GateVerdict;
  pdfUrl: string;
  status: DocStatus;
  createdAt: string;
}

const drafts = new Map<string, DraftRecord>();

export function createDraft(
  intentId: string,
  docType: DocType,
  verdict: GateVerdict,
): DraftRecord {
  const draftId = randomUUID();
  const draft: DraftRecord = {
    draftId,
    intentId,
    docType,
    verdict,
    // mock PDF — 실제 파일 접근 경로는 노출하지 않는다 (보안 3조). 15분 만료 규칙은 M-EVIDENCE
    pdfUrl: `https://mock.namgida.local/drafts/${draftId}.pdf`,
    status: "DRAFT",
    createdAt: new Date().toISOString(),
  };
  drafts.set(draftId, draft);
  return draft;
}

export function getDraft(draftId: string): DraftRecord | undefined {
  return drafts.get(draftId);
}
