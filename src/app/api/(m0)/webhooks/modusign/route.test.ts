// M-WEBHOOK 테스트 (FR-503 · 02.3 §3)
// 핵심: 동일 이벤트 5회 → 상태 전이·증빙 생성 정확히 1회.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { mockSigner, signer } from "@/lib/signer";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { store } from "@/lib/store";
import { drainOutbox } from "./outbox";
import { POST } from "./route";

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/webhooks/modusign", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

/** 서명 요청까지 끝난 draft — 웹훅이 도착할 수 있는 상태 */
async function requestedDraft() {
  const session = await store.getOrCreateSession();
  const draft = await store.createDraft(
    session.id,
    "DONATION_PLEDGE",
    evaluateGate("DONATION_PLEDGE"),
  );
  const result = await signer.requestWithTemplate({
    templateKey: "DONATION_PLEDGE",
    draftId: draft.draftId,
    signerName: "김가상",
    signerEmail: "fake@example.com",
  });
  await store.markDraftRequested(draft.draftId, result.documentId);
  return { draft, documentId: result.documentId };
}

// 외부 세계(모두싸인)를 먼저 전이시키고 그 페이로드를 쓴다 — 보강 조회(02.3 §3 5단계)가
// 읽는 진실은 외부 문서 상태이므로, 전이 없이 페이로드만 쏘는 것은 비현실적 시나리오다.
const externalEvent = async (documentId: string, event: string, eventId: string = randomUUID()) =>
  (await mockSigner!.simulateEvent(documentId, event, eventId))!;

const payloadFor = (documentId: string, event: string, eventId: string = randomUUID()) => ({
  eventId,
  event,
  documentId,
  requesterEmail: null,
  metadata: {},
  occurredAt: new Date().toISOString(),
});

afterEach(() => {
  delete process.env.MODUSIGN_WEBHOOK_SECRET;
});

describe("M-WEBHOOK — 멱등성 (FR-503 수락 기준)", () => {
  it("동일 이벤트 5회 수신 → 전부 200, 상태 전이·증빙 생성은 정확히 1회", async () => {
    const { draft, documentId } = await requestedDraft();
    // 외부 세계도 완료 상태로 (보강 조회가 읽는 대상)
    const p = await externalEvent(documentId, "document_all_signed", "evt-idem-1-" + documentId);
    for (let i = 0; i < 5; i++) {
      expect((await post(p)).status).toBe(200);
    }
    await drainOutbox(); // fire-and-forget 정착 대기 (드레인은 멱등)

    const after = (await store.getDraft(draft.draftId))!;
    expect(after.status).toBe("COMPLETED");
    const evidence = await store.getEvidenceByDraft(draft.draftId);
    expect(evidence).toBeDefined();
    expect(evidence!.sha256).toMatch(/^[0-9a-f]{64}$/);

    // 한 번 더 드레인해도 아무것도 변하지 않는다
    const sha = evidence!.sha256;
    await drainOutbox();
    expect((await store.getEvidenceByDraft(draft.draftId))!.sha256).toBe(sha);
  });

  it("거절 이벤트 → REJECTED 동기화", async () => {
    const { draft, documentId } = await requestedDraft();
    await post(await externalEvent(documentId, "document_rejected"));
    await drainOutbox();
    expect((await store.getDraft(draft.draftId))!.status).toBe("REJECTED");
  });

  it("역행 방지 — 완료 후 requested 이벤트는 스킵", async () => {
    const { draft, documentId } = await requestedDraft();
    await post(await externalEvent(documentId, "document_all_signed"));
    await drainOutbox();
    await post(await externalEvent(documentId, "document_started")); // 외부는 전이 거부, 이벤트만 도착
    await drainOutbox();
    expect((await store.getDraft(draft.draftId))!.status).toBe("COMPLETED");
  });
});

describe("M-WEBHOOK — 재시도 유발 방지", () => {
  it("모르는 documentId → 200, 처리 표시되어 재시도 없음", async () => {
    expect((await post(payloadFor("mock-unknown-doc", "document_all_signed"))).status).toBe(200);
    await drainOutbox();
    const stuck = (await store.listUnprocessedEvents()).filter(
      (e) => e.modusignDocumentId === "mock-unknown-doc",
    );
    expect(stuck).toHaveLength(0); // 미처리로 쌓이면 드레인마다 재시도하게 된다
  });

  it("형식 불일치 페이로드 → 200 (재시도 폭주 방지)", async () => {
    expect((await post({ hello: "world" })).status).toBe(200);
    expect((await post("not-json{{{")).status).toBe(200);
  });
});

describe("M-WEBHOOK — 시크릿 검증", () => {
  it("시크릿 설정 시: 불일치 401 / 일치 200", async () => {
    process.env.MODUSIGN_WEBHOOK_SECRET = "test-secret";
    const { documentId } = await requestedDraft();
    const p = await externalEvent(documentId, "document_all_signed");
    expect((await post(p, { "x-webhook-secret": "wrong" })).status).toBe(401);
    expect((await post(p, { "x-webhook-secret": "test-secret" })).status).toBe(200);
  });
});
