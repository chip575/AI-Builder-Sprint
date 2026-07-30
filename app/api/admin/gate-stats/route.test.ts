// M-GATE-COUNTER 테스트 (FR-509)
// 핵심: 무엇을 세고 무엇을 세지 않는가. 부풀린 지표는 없느니만 못하다.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { store } from "@/lib/store";
import { POST as documentsPost } from "@/app/api/documents/route";
import { POST as signPost } from "@/app/api/sign/[draftId]/route";
import {
  addProposal,
  addUtterance,
  confirmFacts,
  getOrCreateSession,
  saveFacts,
} from "@/lib/ai/session/store";
import type { BranchType, IntentFact } from "@/lib/contracts";
import { GET } from "./route";

const stats = async () => (await (await GET()).json()).data;

async function confirmedSession(branchType: BranchType) {
  const s = await getOrCreateSession();
  const u = await addUtterance(s.id, "테스트");
  await addProposal(s.id, branchType, "EXPRESS", u.id);
  const fact: IntentFact = {
    id: randomUUID(),
    key: "region",
    value: "부산",
    confidence: 0.95,
    sourceSpan: null,
    confirmed: false,
  };
  await saveFacts(s.id, [
    fact,
    { ...fact, id: randomUUID(), key: "amount", value: 1_000_000 },
  ]);
  await confirmFacts(s.id);
  return s;
}

const createDoc = (intentId: string) =>
  documentsPost(
    new Request("http://localhost/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId }),
    }),
  );

describe("M-GATE-COUNTER — 무엇을 세는가 (FR-509)", () => {
  it("유언장 서명 시도 차단 → blockedTotal 증가 + 조문·문서유형 분해", async () => {
    const before = await stats();

    // 서명 경로에서 막힌 사건을 만든다 (draft는 게이트 무효 상태로 직접 생성)
    const s = await getOrCreateSession();
    const draft = await store.createDraft(
      s.id,
      "HANDWRITTEN_WILL",
      evaluateGate("HANDWRITTEN_WILL"),
    );
    const res = await signPost(
      new Request(`http://localhost/api/sign/${draft.draftId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "LINK" }),
      }),
      { params: Promise.resolve({ draftId: draft.draftId }) },
    );
    expect(res.status).toBe(403);

    const after = await stats();
    expect(after.blockedTotal).toBe(before.blockedTotal + 1);
    expect(after.byDocType.HANDWRITTEN_WILL).toBeGreaterThan(0);
    expect(after.byStatute.map((x: { id: string }) => x.id)).toContain("민법 §1066");
  });

  it("문서 생성 단계의 거부는 차단으로 세지 않는다 — 서명 시도가 아니다", async () => {
    const before = await stats();
    const s = await confirmedSession("HANDWRITTEN_WILL");
    expect((await createDoc(s.id)).status).toBe(403);

    const after = await stats();
    expect(after.blockedTotal).toBe(before.blockedTotal); // 증가하지 않는다
    // 다만 판정 자체는 기록된다 (분포 화면의 근거)
    expect(after.totalEvaluations).toBeGreaterThan(before.totalEvaluations);
    expect(after.byVerdict.ESIGN_INVALID).toBeGreaterThan(0);
  });

  it("정상 판정(ESIGN_OK)도 기록되지만 차단 수는 늘지 않는다", async () => {
    const before = await stats();
    const s = await confirmedSession("DONATION_NOW");
    expect((await createDoc(s.id)).status).toBe(200);

    const after = await stats();
    expect(after.byVerdict.ESIGN_OK).toBeGreaterThan(before.byVerdict?.ESIGN_OK ?? 0);
    expect(after.blockedTotal).toBe(before.blockedTotal);
  });

  it("응답은 계약을 만족한다 (GateStatsRes)", async () => {
    const d = await stats();
    expect(typeof d.blockedTotal).toBe("number");
    expect(Array.isArray(d.byStatute)).toBe(true);
    expect(d.totalEvaluations).toBeGreaterThanOrEqual(d.blockedTotal);
  });
});
