// M-SIGN 테스트 — 요청·폴링·게이트 재검증 (FR-501 · FR-502 · FR-104)
import { describe, expect, it } from "vitest";
import { mockSigner } from "@/lib/signer";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { createDraft, getDraft } from "@/app/api/documents/store";
import { POST as signPost } from "./[draftId]/route";
import { GET as statusGet } from "./[draftId]/status/route";

function sign(draftId: string, mode: "LINK" | "EMBED" = "LINK") {
  return signPost(
    new Request(`http://localhost/api/sign/${draftId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    }),
    { params: Promise.resolve({ draftId }) },
  );
}

function status(draftId: string) {
  return statusGet(new Request(`http://localhost/api/sign/${draftId}/status`), {
    params: Promise.resolve({ draftId }),
  });
}

const okDraft = () =>
  createDraft(crypto.randomUUID(), "DONATION_PLEDGE", evaluateGate("DONATION_PLEDGE"));
const freshDraft = (id: string) => getDraft(id);

describe("M-SIGN — 서명 요청 (FR-501)", () => {
  it("LINK 요청 → signUrl + 만료시각, draft REQUESTED, 역참조 저장", async () => {
    const draft = await okDraft();
    const res = await sign(draft.draftId, "LINK");
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.signUrl).toBeTruthy();
    expect(data.embedUrl).toBeNull();
    expect(data.expiresAt).toBeTruthy();

    const after = (await freshDraft(draft.draftId))!;
    expect(after.status).toBe("REQUESTED");
    const doc = await mockSigner!.getDocument(after.modusignDocumentId!);
    expect(doc?.metadata.draftId).toBe(draft.draftId); // metadata 역참조 (02.3 §1)
  });

  it("EMBED 요청 → embedUrl", async () => {
    const draft = await okDraft();
    const { data } = await (await sign(draft.draftId, "EMBED")).json();
    expect(data.embedUrl).toBeTruthy();
    expect(data.signUrl).toBeNull();
  });

  it("중복 요청 → 409 ALREADY_REQUESTED", async () => {
    const draft = await okDraft();
    await sign(draft.draftId);
    const res = await sign(draft.draftId);
    expect(res.status).toBe(409);
  });

  it("ESIGN_OK가 아닌 draft → 403 (P2 — 어떤 경로로든 서버가 차단)", async () => {
    const draft = await createDraft(
      crypto.randomUUID(),
      "HANDWRITTEN_WILL",
      evaluateGate("HANDWRITTEN_WILL"),
    );
    const res = await sign(draft.draftId);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("GATE_BLOCKED");
    expect(body.error.message).toContain("민법 §1066");
    expect((await freshDraft(draft.draftId))?.status).toBe("DRAFT"); // 부분 상태 없음
  });

  it("없는 draft → 404", async () => {
    expect((await sign(crypto.randomUUID())).status).toBe(404);
  });
});

describe("M-SIGN — 상태 폴링 (FR-502)", () => {
  it("요청 전 → DRAFT, 요청 후 → REQUESTED", async () => {
    const draft = await okDraft();
    let body = await (await status(draft.draftId)).json();
    expect(body.data.status).toBe("DRAFT");

    await sign(draft.draftId);
    body = await (await status(draft.draftId)).json();
    expect(body.data.status).toBe("REQUESTED");
    expect(body.data.parties.length).toBeGreaterThan(0);
  });

  it("완료 이벤트 후 폴링 → COMPLETED + completedAt + draft 동기화", async () => {
    const draft = await okDraft();
    await sign(draft.draftId);
    const requested = (await freshDraft(draft.draftId))!;
    mockSigner!.simulateEvent(requested.modusignDocumentId!, "document_completed");

    const body = await (await status(draft.draftId)).json();
    expect(body.data.status).toBe("COMPLETED");
    expect(body.data.completedAt).toBeTruthy();
    expect(body.data.parties.every((p: { signedAt: string | null }) => p.signedAt)).toBe(true);
    expect((await freshDraft(draft.draftId))?.status).toBe("COMPLETED"); // 폴링이 로컬 동기화
  });

  it("거절 이벤트 후 폴링 → REJECTED", async () => {
    const draft = await okDraft();
    await sign(draft.draftId);
    const requested = (await freshDraft(draft.draftId))!;
    mockSigner!.simulateEvent(requested.modusignDocumentId!, "document_rejected");
    const body = await (await status(draft.draftId)).json();
    expect(body.data.status).toBe("REJECTED");
  });
});
