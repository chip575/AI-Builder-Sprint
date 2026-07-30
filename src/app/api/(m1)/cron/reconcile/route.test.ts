// M-RECONCILER 테스트 (FR-504) — 웹훅 유실 시나리오를 재현한다.
import { describe, expect, it } from "vitest";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { mockSigner, signer } from "@/lib/signer";
import { store } from "@/lib/store";
import { GET, POST } from "./route";

/** 웹훅 없이 외부만 완료된 상태 — 유실 상황 그 자체 */
async function requestedDraft() {
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
  return { draftId: draft.draftId, documentId: r.documentId };
}

const run = (staleMs = 0) =>
  POST(new Request(`http://localhost/api/cron/reconcile?staleMs=${staleMs}`, {
    method: "POST",
  }));

describe("M-RECONCILER — 웹훅 유실 복구 (FR-504)", () => {
  it("웹훅이 오지 않아도 외부 완료 상태를 따라잡는다", async () => {
    const { draftId, documentId } = await requestedDraft();
    // 외부만 완료시킨다 — 우리 웹훅 경로는 태우지 않는다 (유실 재현)
    mockSigner!.simulateEvent(documentId, "document_all_signed");
    expect((await store.getDraft(draftId))!.status).toBe("REQUESTED"); // 아직 모름

    const body = await (await run()).json();
    expect(body.data.corrected).toBeGreaterThan(0);
    expect((await store.getDraft(draftId))!.status).toBe("COMPLETED"); // 따라잡음
    expect(body.data.lastSyncAt).toBeTruthy();
  });

  it("이미 일치하면 교정하지 않는다 (멱등 — 두 번 돌려도 0)", async () => {
    const { documentId } = await requestedDraft();
    mockSigner!.simulateEvent(documentId, "document_all_signed");
    await run();
    const second = await (await run()).json();
    expect(second.data.corrected).toBe(0);
  });

  it("아직 진행 중인 문서는 건드리지 않는다", async () => {
    const { draftId } = await requestedDraft(); // 외부도 REQUESTED
    await run();
    expect((await store.getDraft(draftId))!.status).toBe("REQUESTED");
  });

  it("임계 이내(최근) 문서는 대상이 아니다 — 5분 규칙", async () => {
    const { draftId, documentId } = await requestedDraft();
    mockSigner!.simulateEvent(documentId, "document_all_signed");
    await run(5 * 60 * 1000); // 방금 만든 draft는 5분 임계에 안 걸린다
    expect((await store.getDraft(draftId))!.status).toBe("REQUESTED");
  });

  it("Cron 인증 헤더가 붙은 GET은 **실행**한다 — Vercel Cron은 GET으로 부른다", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const { draftId, documentId } = await requestedDraft();
    mockSigner!.simulateEvent(documentId, "document_all_signed");

    const res = await GET(
      new Request("http://localhost/api/cron/reconcile?staleMs=0", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    const body = await res.json();
    expect(body.data.corrected).toBeGreaterThan(0); // 조회가 아니라 실행됐다
    expect((await store.getDraft(draftId))!.status).toBe("COMPLETED");
    delete process.env.CRON_SECRET;
  });

  it("헤더가 틀리면 조회만 한다 — 아무나 스케줄러를 돌릴 수 없다", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const res = await GET(
      new Request("http://localhost/api/cron/reconcile", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    const body = await res.json();
    expect(body.data.corrected).toBeUndefined(); // 실행 결과가 아니라 상태다
    expect(body.data).toHaveProperty("lastSyncAt");
    delete process.env.CRON_SECRET;
  });

  it("GET — 마지막 동기화·누적 교정 건수 (관리자 화면 재료)", async () => {
    await run();
    const body = await (await GET(new Request("http://localhost/api/cron/reconcile"))).json();
    expect(body.data.lastSyncAt).toBeTruthy();
    expect(body.data.correctedTotal).toBeGreaterThanOrEqual(0);
  });
});
