// M-MOCK 테스트 — 키 없이 전 흐름 (NFR-707) + 멱등성·역행 방지 (FR-503 · 02.3 §3)
import { describe, expect, it } from "vitest";
import { MockSigner } from "./mock-signer";

const input = {
  templateKey: "DONATION_PLEDGE",
  draftId: "00000000-0000-4000-8000-000000000001",
  signerName: "김가상",
  signerEmail: "fake@example.com", // 전량 가상 인물 (보안 4조)
};

describe("M-MOCK — 키 없는 전체 흐름", () => {
  it("요청 → REQUESTED, 임베디드 URL은 2시간 만료", async () => {
    const s = new MockSigner();
    const r = await s.requestWithTemplate(input);
    const doc = await s.getDocument(r.documentId);
    expect(doc?.status).toBe("REQUESTED");
    expect(doc?.metadata.draftId).toBe(input.draftId); // 역참조 (02.3 §1)
    const ttlMs = new Date(r.expiresAt!).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(1.9 * 60 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(2 * 60 * 60 * 1000);
  });

  it("완료 이벤트 → COMPLETED + completedAt + 서명자 signedAt", async () => {
    const s = new MockSigner();
    const r = await s.requestWithTemplate(input);
    s.simulateEvent(r.documentId, "document_all_signed");
    const doc = await s.getDocument(r.documentId);
    expect(doc?.status).toBe("COMPLETED");
    expect(doc?.completedAt).not.toBeNull();
    expect(doc?.parties.every((p) => p.signedAt)).toBe(true);
  });

  it("동일 이벤트 5회 수신 → 상태 전이·부수효과는 정확히 1회 (FR-503)", async () => {
    const s = new MockSigner();
    const r = await s.requestWithTemplate(input);
    for (let i = 0; i < 5; i++) {
      s.simulateEvent(r.documentId, "document_all_signed", "evt-dup-1");
    }
    expect(s.sideEffectCount).toBe(1);
    expect((await s.getDocument(r.documentId))?.status).toBe("COMPLETED");
  });

  it("역행 전이 무시 — COMPLETED 후 requested 이벤트는 스킵 (02.3 §3)", async () => {
    const s = new MockSigner();
    const r = await s.requestWithTemplate(input);
    s.simulateEvent(r.documentId, "document_all_signed");
    s.simulateEvent(r.documentId, "document_started");
    expect((await s.getDocument(r.documentId))?.status).toBe("COMPLETED");
  });

  it("거절 이벤트 → REJECTED, 취소 API → CANCELED + 사유 (FR-506)", async () => {
    const s = new MockSigner();
    const a = await s.requestWithTemplate(input);
    s.simulateEvent(a.documentId, "document_rejected");
    expect((await s.getDocument(a.documentId))?.status).toBe("REJECTED");

    const b = await s.requestWithTemplate(input);
    await s.cancel(b.documentId, "테스트 취소");
    const doc = await s.getDocument(b.documentId);
    expect(doc?.status).toBe("CANCELED");
    expect(doc?.rejectReason).toBe("테스트 취소");
  });

  it("자동 완료 타이머 — mock 모드의 서명자 흉내 (02.4 §5)", async () => {
    const s = new MockSigner(5);
    const r = await s.requestWithTemplate(input);
    await new Promise((res) => setTimeout(res, 50));
    expect((await s.getDocument(r.documentId))?.status).toBe("COMPLETED");
  });

  it("상태 필터 목록 조회", async () => {
    const s = new MockSigner();
    const a = await s.requestWithTemplate(input);
    await s.requestWithTemplate(input);
    s.simulateEvent(a.documentId, "document_all_signed");
    expect(await s.listDocuments({ status: "COMPLETED" })).toHaveLength(1);
    expect(await s.listDocuments({ status: "REQUESTED" })).toHaveLength(1);
    expect(await s.listDocuments()).toHaveLength(2);
  });
});
