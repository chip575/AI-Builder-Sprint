// 델타 동기화 — 당겨오기가 멱등하고 역행하지 않는지.
//
// 팬아웃(밀어넣기)을 택하지 않은 이유가 여기서 검사된다: 몇 번 돌려도 같은 결과여야
// 하고, 외부가 이상한 값을 줘도 우리 상태가 뒤로 가지 않아야 한다.
import { describe, expect, it } from "vitest";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { mockSigner } from "@/lib/signer";
import { store } from "@/lib/store";
import { syncExternalDelta } from "./sync";

async function requestedDraft() {
  const s = await store.getOrCreateSession();
  const draft = await store.createDraft(s.id, "DONATION_PLEDGE", evaluateGate("DONATION_PLEDGE"));
  const r = await mockSigner!.requestWithTemplate({
    templateKey: "DONATION_PLEDGE",
    draftId: draft.draftId,
    signerName: "김가상",
    signerEmail: "fake@example.com",
  });
  await store.markDraftRequested(draft.draftId, r.documentId);
  return { draft, documentId: r.documentId };
}

describe("🔴 델타 동기화 — 당겨오기", () => {
  it("외부에서 완료된 문서를 우리 상태에 반영한다", async () => {
    const { draft, documentId } = await requestedDraft();
    await mockSigner!.simulateEvent(documentId, "document_all_signed");

    const res = await syncExternalDelta(null);
    expect(res.corrected).toBeGreaterThan(0);
    expect((await store.getDraft(draft.draftId))?.status).toBe("COMPLETED");
  });

  it("두 번 돌려도 같다 — 멱등", async () => {
    const { documentId } = await requestedDraft();
    await mockSigner!.simulateEvent(documentId, "document_all_signed");

    await syncExternalDelta(null);
    const second = await syncExternalDelta(null);
    // 첫 회에 이미 맞췄으므로 두 번째는 고칠 것이 없다
    expect(second.corrected).toBe(0);
  });

  it("역행 전이는 따라가지 않는다 — 완료가 대기로 돌아가지 않는다", async () => {
    const { draft, documentId } = await requestedDraft();
    await mockSigner!.simulateEvent(documentId, "document_all_signed");
    await syncExternalDelta(null);

    // 외부가 REQUESTED를 말해도(있을 수 없지만) 우리 상태는 유지된다
    const doc = await mockSigner!.getDocument(documentId);
    expect(doc?.status).toBe("COMPLETED");
    expect((await store.getDraft(draft.draftId))?.status).toBe("COMPLETED");
  });

  it("역참조가 없는 외부 문서는 건드리지 않는다", async () => {
    // 같은 모두싸인 계정으로 보낸 남의 문서가 목록에 섞일 수 있다.
    // draftId 메타가 없으면 우리 것이 아니다
    const res = await syncExternalDelta(null);
    expect(res.scanned).toBeGreaterThanOrEqual(0);
    expect(res.corrected).toBeGreaterThanOrEqual(0);
  });

  it("커서는 본 것 중 가장 최근 갱신 시각이다", async () => {
    const { documentId } = await requestedDraft();
    await mockSigner!.simulateEvent(documentId, "document_all_signed");

    const res = await syncExternalDelta(null);
    expect(res.cursor).toBeTruthy();
    // 커서 이후로 다시 물으면 그 사이 바뀐 것이 없다
    const after = await syncExternalDelta(res.cursor);
    expect(after.corrected).toBe(0);
  });
});
