// 공유 계약 스위트 — 한 스위트, 두 구현 (인메모리는 CI 상시, Supabase는 키 있을 때).
// "인메모리와 Supabase가 같은 규칙"이라는 주장의 유일한 증명이다.
// 인메모리의 멱등·불변 흉내는 이 스위트가 요구하는 만큼만 구현한다.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { IntentFact } from "../contracts/extract";
import type { StorePort } from "./port";

const fact = (key: string, value: IntentFact["value"], confidence = 0.95): IntentFact => ({
  id: randomUUID(),
  key,
  value,
  confidence,
  sourceSpan: null,
  confirmed: false,
});

export function storeContractTests(name: string, makeStore: () => Promise<StorePort>) {
  describe(`StorePort 계약 — ${name}`, () => {
    it("웹훅: 동일 external_event_id 5회 insert → 1건 (ON CONFLICT DO NOTHING)", async () => {
      const s = await makeStore();
      const eventId = `evt-${randomUUID()}`;
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(
          await s.insertWebhookEvent({
            externalEventId: eventId,
            event: "document_all_signed",
            payload: { seq: i },
          }),
        );
      }
      expect(results.filter((r) => r === "INSERTED")).toHaveLength(1);
      expect(results.filter((r) => r === "DUPLICATE")).toHaveLength(4);
      const stored = (await s.listUnprocessedEvents()).filter(
        (e) => e.externalEventId === eventId,
      );
      expect(stored).toHaveLength(1);
      expect((stored[0]!.payload as { seq: number }).seq).toBe(0); // 최초 페이로드 보존
    });

    it("facts: 미확정 UPSERT → 갱신됨 (중복이 정정, ON CONFLICT DO UPDATE)", async () => {
      const s = await makeStore();
      const session = await s.getOrCreateSession();
      await s.saveFacts(session.id, [fact("amount", 100_000, 0.6)]);
      const after = await s.saveFacts(session.id, [fact("amount", 300_000, 0.95)]);
      const amount = after.find((f) => f.key === "amount")!;
      expect(amount.value).toBe(300_000);
      expect(amount.confidence).toBe(0.95);
      expect(after.filter((f) => f.key === "amount")).toHaveLength(1); // 행 1개 유지
    });

    it("facts: 확정된 값은 재추출이 덮지 못한다 (WHERE confirmed=false — P1 DB 방어)", async () => {
      const s = await makeStore();
      const session = await s.getOrCreateSession();
      await s.saveFacts(session.id, [fact("amount", 100_000)]);
      await s.confirmFacts(session.id);
      const after = await s.saveFacts(session.id, [fact("amount", 999_999, 0.3)]);
      const amount = after.find((f) => f.key === "amount")!;
      expect(amount.value).toBe(100_000); // 보호됨
      expect(amount.confirmed).toBe(true);
    });

    it("facts: 확정값 변경은 사용자 PATCH 경로만 — patch 후 확정 무효", async () => {
      const s = await makeStore();
      const session = await s.getOrCreateSession();
      const saved = await s.saveFacts(session.id, [fact("amount", 100_000)]);
      await s.confirmFacts(session.id);
      const patched = await s.patchFactValue(saved[0]!.id, 700_000);
      expect(patched?.value).toBe(700_000);
      expect(patched?.confirmed).toBe(false); // 재확정 필요
      expect(patched?.confidence).toBe(1);
    });

    it("utterances: 소프트 삭제는 단방향 — 2회째는 거부, 조회에서 사라짐", async () => {
      const s = await makeStore();
      const session = await s.getOrCreateSession();
      const u = await s.addUtterance(session.id, "삭제될 발화");
      expect(await s.softDeleteUtterance(u.id)).toBe(true);
      expect(await s.softDeleteUtterance(u.id)).toBe(false); // 번복·재삭제 불가 (D-10)
      const reloaded = await s.getSession(session.id);
      expect(reloaded!.utterances.find((x) => x.id === u.id)).toBeUndefined();
    });

    it("drafts: 생성 → REQUESTED 마킹 → 상태 동기화 왕복", async () => {
      const s = await makeStore();
      const session = await s.getOrCreateSession();
      const draft = await s.createDraft(session.id, "DONATION_PLEDGE", {
        verdict: "ESIGN_OK",
        statutes: [],
      });
      expect(draft.status).toBe("DRAFT");
      // 고정 문자열 금지 — modusign_document_id는 UNIQUE라, 영속 DB에서 재실행하면
      // 충돌한다. 공유 스위트는 인메모리든 실 DB든 몇 번을 돌려도 통과해야 한다.
      const docId = `mock-doc-${randomUUID()}`;
      await s.markDraftRequested(draft.draftId, docId);
      let d = await s.getDraft(draft.draftId);
      expect(d?.status).toBe("REQUESTED");
      expect(d?.modusignDocumentId).toBe(docId);
      await s.syncDraftStatus(draft.draftId, "COMPLETED");
      d = await s.getDraft(draft.draftId);
      expect(d?.status).toBe("COMPLETED");
      expect(d?.verdict.verdict).toBe("ESIGN_OK"); // 판정 원본 보존
    });

    it("confirmedAt: 확정 시 값·수정 시 무효 — 확정 여부의 진실은 서버가 소유한다", async () => {
      const s = await makeStore();
      const session = await s.getOrCreateSession();
      const saved = await s.saveFacts(session.id, [fact("amount", 100_000)]);
      expect((await s.getSession(session.id))!.confirmedAt).toBeNull();

      await s.confirmFacts(session.id);
      const confirmed = (await s.getSession(session.id))!.confirmedAt;
      expect(confirmed).toBeTruthy();

      await s.patchFactValue(saved[0]!.id, 300_000);
      expect((await s.getSession(session.id))!.confirmedAt).toBeNull(); // 수정 → 확정 무효
    });

    it("시각은 ISO(Z) 형식으로 나온다 — 두 구현이 같은 형식이어야 계약이 하나로 유지된다", async () => {
      // 계약의 z.string().datetime()은 Z 표기만 허용한다. PostgREST는 '+00:00'로 주므로
      // 어댑터가 정규화해야 한다 (e2e에서 500으로 터진 실제 버그).
      const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
      const s = await makeStore();
      const session = await s.getOrCreateSession();
      expect(session.startedAt).toMatch(ISO_Z);
      const u = await s.addUtterance(session.id, "시각 형식 확인");
      expect(u.at).toMatch(ISO_Z);
      const draft = await s.createDraft(session.id, "DONATION_PLEDGE", {
        verdict: "ESIGN_OK",
        statutes: [],
      });
      expect(draft.createdAt).toMatch(ISO_Z);
      const ev = await s.createEvidence({
        draftId: draft.draftId,
        pdfStoragePath: `evidences/${draft.draftId}.pdf`,
        sha256: "a".repeat(64),
        signedAt: new Date().toISOString(),
        parties: [],
      });
      expect(ev.signedAt).toMatch(ISO_Z);
      expect(ev.createdAt).toMatch(ISO_Z);
    });

    it("events: 처리 마킹 후 미처리 목록에서 제외 (아웃박스)", async () => {
      const s = await makeStore();
      const eventId = `evt-${randomUUID()}`;
      await s.insertWebhookEvent({ externalEventId: eventId, event: "e", payload: {} });
      const [evt] = (await s.listUnprocessedEvents()).filter(
        (e) => e.externalEventId === eventId,
      );
      await s.markEventProcessed(evt!.id);
      expect(
        (await s.listUnprocessedEvents()).find((e) => e.externalEventId === eventId),
      ).toBeUndefined();
    });
  });
}
