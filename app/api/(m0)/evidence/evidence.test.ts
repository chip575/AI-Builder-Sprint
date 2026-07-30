// M-EVIDENCE 테스트 (FR-505 · D-10)
// 쓰기는 웹훅 아웃박스 경로로 만들어진 증빙을 그대로 읽는다 — 읽기는 읽기만.
import { describe, expect, it } from "vitest";
import { mockSigner, signer } from "@/lib/signer";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { store } from "@/lib/store";
import { POST as webhookPost } from "@/app/api/(m0)/webhooks/modusign/route";
import { drainOutbox } from "@/app/api/(m0)/webhooks/modusign/outbox";
import { issueEvidenceUrl } from "./sign-url";
import { GET as evidenceGet } from "./[docId]/route";
import { GET as pdfGet } from "./[docId]/pdf/route";

/** 완료 웹훅까지 실경로로 처리된 draft — 증빙이 존재하는 상태 */
async function completedDraft() {
  const session = await store.getOrCreateSession();
  const draft = await store.createDraft(
    session.id,
    "DONATION_PLEDGE",
    evaluateGate("DONATION_PLEDGE"),
  );
  const r = await signer.requestWithTemplate({
    templateKey: "DONATION_PLEDGE",
    draftId: draft.draftId,
    signerName: "김가상",
    signerEmail: "fake@example.com",
  });
  await store.markDraftRequested(draft.draftId, r.documentId);
  const payload = mockSigner!.simulateEvent(r.documentId, "document_all_signed")!;
  await webhookPost(
    new Request("http://localhost/api/webhooks/modusign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  await drainOutbox();
  return draft;
}

function getEvidence(docId: string) {
  return evidenceGet(new Request(`http://localhost/api/evidence/${docId}`), {
    params: Promise.resolve({ docId }),
  });
}

function fetchPdf(urlStr: string, docId: string) {
  return pdfGet(new Request(urlStr), { params: Promise.resolve({ docId }) });
}

describe("M-EVIDENCE — 조회 (FR-505)", () => {
  it("완료 문서 → pdfUrl(만료 쿼리 포함)·signedAt·parties·해시. 해시는 저장값 그대로", async () => {
    const draft = await completedDraft();
    const res = await getEvidence(draft.draftId);
    expect(res.status).toBe(200);
    const { data } = await res.json();

    const stored = (await store.getEvidenceByDraft(draft.draftId))!;
    expect(data.hash).toBe(stored.sha256); // 재계산이 아니라 저장된 증빙
    expect(data.signedAt).toBe(stored.signedAt);
    expect(data.parties.length).toBeGreaterThan(0);
    expect(data.pdfUrl).toContain("expires=");
    expect(data.pdfUrl).toContain("sig=");
  });

  it("미완료 draft → 404 (증빙 없음)", async () => {
    const session = await store.getOrCreateSession();
    const draft = await store.createDraft(
      session.id,
      "DONATION_PLEDGE",
      evaluateGate("DONATION_PLEDGE"),
    );
    expect((await getEvidence(draft.draftId)).status).toBe(404);
  });

  it("없는 docId → 404", async () => {
    expect((await getEvidence(crypto.randomUUID())).status).toBe(404);
  });

  it.todo("타인 소유 증빙 → 404 (존재 여부도 미노출) — M-AUTH 후 활성화");
});

describe("M-EVIDENCE — 만료형 URL (D-10, mock에서도 실계산)", () => {
  it("유효 URL → 200 application/pdf", async () => {
    const draft = await completedDraft();
    const url = issueEvidenceUrl("http://localhost", draft.draftId);
    const res = await fetchPdf(url, draft.draftId);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(await res.text()).toContain("%PDF");
  });

  it("만료된 URL → 403 URL_EXPIRED + 재발급 안내", async () => {
    const draft = await completedDraft();
    const url = issueEvidenceUrl("http://localhost", draft.draftId, -1_000); // 이미 만료
    const res = await fetchPdf(url, draft.draftId);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("URL_EXPIRED");
    expect(body.error.nextAction).toContain("다시 발급");
  });

  it("서명 위조 URL → 403 URL_INVALID", async () => {
    const draft = await completedDraft();
    const url = issueEvidenceUrl("http://localhost", draft.draftId).replace(
      /sig=[0-9a-f]+/,
      "sig=" + "0".repeat(64),
    );
    expect((await fetchPdf(url, draft.draftId)).status).toBe(403);
  });
});
