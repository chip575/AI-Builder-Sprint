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

export function storeContractTests(
  name: string,
  makeStore: () => Promise<StorePort>,
  /** heartWill: 마음 유언 테이블(20260730160227)이 적용된 저장소인가.
   *  추측하지 않는다 — 호출부가 실제로 물어보고 넘긴다 (supabase.contract.test.ts) */
  opts: { heartWill?: boolean } = {},
) {
  const { heartWill = true } = opts;
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

    // ── 마음 유언 (FR-111) ──────────────────────────────────
    // 이 다섯 케이스가 "승인한 것만 남는다"의 정의다. 화면이나 라우트가 아니라
    // 저장소가 그것을 지킨다 — UI를 우회해도 미승인 문단은 본문에 들어가지 못한다.
    describe.skipIf(!heartWill)("마음 유언", () => {
      /** 발화 2개를 가진 세션 + 각 발화를 근거로 한 AI 초안 2문단 */
      async function seeded(s: StorePort) {
        const session = await s.getOrCreateSession();
        const u1 = await s.addUtterance(session.id, "아이들에게 미안했던 날이 있었다");
        const u2 = await s.addUtterance(session.id, "고맙다는 말을 못 했다");
        const head = await s.draftHeartWillParagraphs(session.id, [
          { body: "미안했던 마음을 남깁니다.", origin: "AI_DRAFT", sourceUtteranceId: u1.id },
          { body: "고맙다는 말을 남깁니다.", origin: "AI_DRAFT", sourceUtteranceId: u2.id },
        ]);
        return { session, u1, u2, head };
      }

      it("근거 발화 없는 문단은 만들 수 없다 (source_utterance_id NOT NULL의 코드판)", async () => {
        const s = await makeStore();
        const session = await s.getOrCreateSession();
        await expect(
          s.draftHeartWillParagraphs(session.id, [
            { body: "AI가 지어낸 문장", origin: "AI_DRAFT", sourceUtteranceId: randomUUID() },
          ]),
        ).rejects.toThrow();
        // 거부는 전량이다 — 문서 자체가 생기지 않는다
        expect(await s.getHeartWillHead(session.id)).toBeUndefined();
      });

      it("초안은 미승인으로 쌓인다 — 기본값이 미승인이라 조용히 반영될 길이 없다 (P1)", async () => {
        const s = await makeStore();
        const { head } = await seeded(s);
        expect(head.paragraphs).toHaveLength(2);
        expect(head.paragraphs.every((p) => p.acceptedAt === null)).toBe(true);
        expect(head.prevVersionId).toBeNull(); // 아직 첫 버전 — 승인이 없었으니 체인도 없다
      });

      it("승인한 문단만 본문에 들어간다 — 미승인분은 유예되고 버려지지 않는다", async () => {
        const s = await makeStore();
        const { session, head } = await seeded(s);
        const target = head.paragraphs[0]!;

        const result = await s.applyHeartWill(session.id, [target.id]);
        expect(result).not.toBeNull();
        expect(result!.previousParagraphs).toHaveLength(0); // 직전 본문은 비어 있었다

        const body = result!.version.paragraphs.filter((p) => p.acceptedAt !== null);
        const pending = result!.version.paragraphs.filter((p) => p.acceptedAt === null);
        expect(body.map((p) => p.body)).toEqual([target.body]);
        expect(pending).toHaveLength(1); // 승인하지 않은 초안은 다음 판단을 기다린다
        expect(pending[0]!.sourceUtteranceId).toBe(head.paragraphs[1]!.sourceUtteranceId);
        expect(result!.version.prevVersionId).toBe(head.versionId); // 체인이 이어졌다
      });

      it("빈 승인 배열 → 버전이 생기지 않는다 (빈 승인은 '전부 승인'이 아니다)", async () => {
        const s = await makeStore();
        const { session, head } = await seeded(s);
        expect(await s.applyHeartWill(session.id, [])).toBeNull();
        const after = await s.getHeartWillHead(session.id);
        expect(after!.versionId).toBe(head.versionId); // 현재 버전 그대로
        expect(after!.paragraphs.every((p) => p.acceptedAt === null)).toBe(true);
      });

      it("같은 발화를 근거로 새로 승인된 문단이 옛 문단을 대체한다 (수정)", async () => {
        const s = await makeStore();
        const { session, u1, head } = await seeded(s);
        await s.applyHeartWill(session.id, [head.paragraphs[0]!.id]);

        await s.draftHeartWillParagraphs(session.id, [
          { body: "미안했던 마음을, 제 말로 남깁니다.", origin: "USER_EDITED", sourceUtteranceId: u1.id },
        ]);
        const staged = (await s.getHeartWillHead(session.id))!;
        const edited = staged.paragraphs.find((p) => p.origin === "USER_EDITED")!;

        const result = await s.applyHeartWill(session.id, [edited.id]);
        const body = result!.version.paragraphs.filter((p) => p.acceptedAt !== null);
        // 같은 근거의 문단이 둘로 늘지 않는다 — 하나가 다른 하나를 대체한다
        expect(body.filter((p) => p.sourceUtteranceId === u1.id)).toHaveLength(1);
        expect(body.find((p) => p.sourceUtteranceId === u1.id)!.body).toBe(edited.body);
        expect(result!.previousParagraphs).toHaveLength(1); // 대체당한 옛 본문
      });
    });

    // ── 알릴 상대 · 지킴이 · 철회 (FR-405) ────────────────────
    //
    // ⚠ **이 블록이 없어서 Supabase 어댑터의 테이블 이름 오타가 526개 테스트를
    //   통과했다** (2026-08-03). 새 StorePort 메서드를 여기 넣지 않으면 인메모리만
    //   검사되고 실 DB 경로는 아무도 안 본다 — 증상은 에러가 아니라 배포 후 500이다.
    describe("알릴 상대 · 지킴이 · 철회", () => {
      it("상대를 넣고 역할로 거른다. 소유자가 다르면 안 보인다", async () => {
        const s = await makeStore();
        const me = randomUUID();
        const other = randomUUID();
        await s.upsertRecipient(me, { kind: "ORG", name: "가상재단", email: `o${Date.now()}@example.org` });
        await s.upsertRecipient(me, { kind: "FAMILY", name: "김가상", email: `f${Date.now()}@example.org`, relation: "장녀" });
        await s.upsertRecipient(other, { kind: "ORG", name: "남의 기관", email: `x${Date.now()}@example.org` });

        expect(await s.listRecipients(me)).toHaveLength(2);
        expect(await s.listRecipients(me, "ORG")).toHaveLength(1);
        // 🔴 시각 형식이 두 구현에서 같아야 한다. PostgREST는 '+00:00' 오프셋으로 주고
        //    계약은 Z만 받는다 — 어긋나면 라우트의 parse가 500으로 던진다
        for (const r of await s.listRecipients(me)) {
          expect(r.createdAt, r.name).toMatch(/Z$/);
        }
        // 소유 격리 — 남의 것이 섞이면 통지가 엉뚱한 곳으로 간다
        expect((await s.listRecipients(other)).every((r) => r.name === "남의 기관")).toBe(true);
      });

      it("남의 상대는 지워지지 않는다", async () => {
        const s = await makeStore();
        const me = randomUUID();
        const other = randomUUID();
        const his = await s.upsertRecipient(other, { kind: "ORG", name: "남의 기관", email: `d${Date.now()}@example.org` });
        expect(await s.deleteRecipient(me, his.id)).toBe(false);
        expect(await s.listRecipients(other)).toHaveLength(1);
      });

      it("지킴이는 서명 전까지 열람이 열리지 않는다", async () => {
        const s = await makeStore();
        const me = randomUUID();
        const p = await s.upsertRecipient(me, { kind: "CUSTODIAN", name: "이가상", email: `c${Date.now()}@example.org` });
        const session = await s.getOrCreateSession(null, me);
        const draft = await s.createDraft(session.id, "CUSTODIAN_AGREEMENT", { verdict: "ESIGN_OK", statutes: [] });

        const c = await s.upsertCustodian(me, {
          recipientId: p.id,
          displayName: "이가상",
          viewScope: ["FINANCIAL"],
          agreementDraftId: draft.draftId,
        });
        expect(c.status).toBe("PENDING");
        expect(c.grantedAt).toBeNull(); // 🔴 열람의 기준은 grantedAt이다

        const granted = await s.grantCustodian(draft.draftId);
        expect(granted?.status).toBe("ACTIVE");
        expect(granted?.grantedAt).not.toBeNull();

        // 거둔 뒤에는 뒤늦은 서명으로도 되살아나지 않는다
        expect(await s.revokeCustodian(me, c.id)).toBe(true);
        expect(await s.grantCustodian(draft.draftId)).toBeUndefined();
      });

      it("철회하면 모든 노드가 REVOKED가 되고 해시는 그대로다", async () => {
        const s = await makeStore();
        // subject_id에 FK가 걸려 있다 — 임의 uuid를 넣으면 실 DB에서만 터진다.
        // 인메모리는 FK가 없어 통과하므로, 이 한 줄이 두 구현의 차이를 메운다
        // subject_id → intents(id) FK. **draftId가 아니라 intentId다** —
        // 인메모리는 FK가 없어 무엇을 넣든 통과하므로 실 DB에서만 드러난다
        const subjectId = (await s.getOrCreateSession(null, randomUUID())).id;
        await s.appendLedgerNode({
          subjectId,
          changeSummary: { first: true },
          changeReason: "처음 남긴 뜻",
          materiality: "MATERIAL",
        });
        const before = await s.listLedgerNodes(subjectId);
        const hashBefore = before.map((n) => n.nodeHash);

        // 🔴 철회는 **쌓는 행위**다. 지난 노드를 고치려 하면 append-only 트리거가
        //    막는다 (NFR-704) — 인메모리에는 트리거가 없어 실 DB에서만 드러난다
        await s.appendLedgerNode({
          subjectId,
          changeSummary: { revoked: true },
          changeReason: "받으실 곳을 바꾸기로 했습니다",
          materiality: "MATERIAL",
          status: "REVOKED",
        });

        const after = await s.listLedgerNodes(subjectId);
        // 마지막이 REVOKED면 체인 전체가 닫힌다 — 살아 있는 뜻이 없다
        expect(after.every((n) => n.status === "REVOKED")).toBe(true);
        expect(after.some((n) => n.status === "ACTIVE")).toBe(false);
        // 지난 노드의 해시는 그대로다 — 고치지 않았으니 당연하고, 그게 요점이다
        expect(after.slice(0, hashBefore.length).map((n) => n.nodeHash)).toEqual(hashBefore);
      });
    });

    it("자산 고치기 — 확정은 올리기만, 남의 것은 못 고친다 (P1 · D-18)", async () => {
      const s = await makeStore();
      const me = randomUUID();
      const other = randomUUID();
      const a = await s.createAsset({
        userId: me,
        category: "DIGITAL",
        label: "구독 서비스",
        origin: "OCR",
        confidence: 0.4,
        disposition: { action: "PRESERVE" },
      });
      expect(a.confirmed).toBe(false); // 판독 산출물은 미확인으로 시작한다 (P1)

      const changed = await s.updateAsset(me, a.id, {
        disposition: { action: "DELETE" },
        // P1-CONFIRM-PATH: 사용자가 직접 확인하는 정당한 경로를 재는 검사다
        confirmed: true,
      });
      expect(changed?.confirmed).toBe(true);
      expect(changed?.category === "DIGITAL" && changed.disposition.action).toBe("DELETE");

      // 🔴 남의 자산은 못 고친다 — id만 걸면 남의 것이 바뀐다
      // P1-CONFIRM-PATH: 남이 확인하려 들면 막히는지를 재는 검사다
      expect(await s.updateAsset(other, a.id, { confirmed: true })).toBeUndefined();
      // 안 보낸 항목은 그대로 둔다 (undefined = 안 건드림)
      const kept = await s.updateAsset(me, a.id, { story: "오래 쓰던 계정입니다" });
      expect(kept?.category === "DIGITAL" && kept.disposition.action).toBe("DELETE");
    });

    it("마음 유언 전달 설정 — 예약이 아니면 날짜를 비운다 (FR-112)", async () => {
      const s = await makeStore();
      const session = await s.getOrCreateSession(null, randomUUID());
      // 문서가 없으면 전할 글도 없다
      expect(await s.getHeartWillDelivery(session.id)).toBeUndefined();

      const u = await s.addUtterance(session.id, "아이들에게 미안했다고 전하고 싶어요");
      await s.draftHeartWillParagraphs(session.id, [
        { body: "미안했다고 전하고 싶습니다.", origin: "AI_DRAFT", sourceUtteranceId: u.id },
      ]);
      const head = await s.getHeartWillHead(session.id);
      await s.applyHeartWill(session.id, head!.paragraphs.map((p) => p.id));

      // 정하지 않았어도 상태는 있다 — 기본은 사후 공개다
      expect((await s.getHeartWillDelivery(session.id))?.revealPolicy).toBe("POSTHUMOUS");

      const scheduled = await s.saveHeartWillDelivery(session.id, {
        revealPolicy: "SCHEDULED",
        revealAt: "2027-01-01T00:00:00.000Z",
        recipientIds: [],
      });
      expect(scheduled?.revealAt).not.toBeNull();

      // 🔴 예약이 아니게 되면 날짜가 남지 않는다 — 남으면 "언제 가는지"가 갈린다
      const back = await s.saveHeartWillDelivery(session.id, {
        revealPolicy: "POSTHUMOUS",
        revealAt: "2027-01-01T00:00:00.000Z",
        recipientIds: [],
      });
      expect(back?.revealAt).toBeNull();
    });

    it("mock 슬롯: 마지막으로 쓴 상태가 읽힌다 (인스턴스 교체 대비)", async () => {
      const s = await makeStore();
      const docId = `mock-${randomUUID()}`;
      expect(await s.getMockDoc(docId)).toBeUndefined();
      await s.putMockDoc(docId, { doc: { status: "REQUESTED" }, events: [] });
      await s.putMockDoc(docId, { doc: { status: "COMPLETED" }, events: ["e1"] });
      const got = await s.getMockDoc(docId);
      expect((got?.doc as { status: string }).status).toBe("COMPLETED");
      expect(got?.events).toEqual(["e1"]);
    });
  });
}
