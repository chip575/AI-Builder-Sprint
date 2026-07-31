// M-GATE-COUNTER 테스트 (FR-509)
// 핵심: 무엇을 세고 무엇을 세지 않는가. 부풀린 지표는 없느니만 못하다.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { store } from "@/lib/store";
import { POST as documentsPost } from "@/app/api/(m0)/documents/route";
import { POST as signPost } from "@/app/api/(m0)/sign/[draftId]/route";
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

  // 2026-08-01 규칙 변경: 이전에는 ∧ wasSignAttempt를 요구해 이 케이스를 **세지 않았다**.
  // 그런데 UI 경로에서는 ESIGN_OK가 아닌 draft를 /api/documents가 애초에 만들지 않으므로
  // 서명 단계에 도달할 방법이 없다 — 카운터가 영원히 0으로 고정됐다 (실측 판정 11건, 표시 0).
  // 문서 생성 단계의 차단도 차단이다.
  it("🔴 문서 생성 단계의 차단도 센다 — UI 경로에서 발생하는 유일한 차단이다", async () => {
    const before = await stats();
    const s = await confirmedSession("HANDWRITTEN_WILL");
    expect((await createDoc(s.id)).status).toBe(403);

    const after = await stats();
    expect(after.blockedTotal).toBe(before.blockedTotal + 1);
    expect(after.byDocType.HANDWRITTEN_WILL).toBeGreaterThan(0);
    expect(after.byStatute.map((x: { id: string }) => x.id)).toContain("민법 §1066");
  });

  it("정상 판정(ESIGN_OK)도 기록되지만 차단 수는 늘지 않는다", async () => {
    const before = await stats();
    const s = await confirmedSession("DONATION_NOW");
    expect((await createDoc(s.id)).status).toBe(200);

    const after = await stats();
    expect(after.byVerdict.ESIGN_OK).toBeGreaterThan(before.byVerdict?.ESIGN_OK ?? 0);
    expect(after.blockedTotal).toBe(before.blockedTotal);
  });

  // 쌍의 반대편 — 규칙을 넓혔다고 NON_BINDING까지 삼키면 지표가 부풀려진다.
  // 바뀐 것은 wasSignAttempt 조건뿐이고 NON_BINDING 제외는 그대로다
  it("NON_BINDING은 여전히 차단이 아니다 — 정상 라우팅을 차단으로 세지 않는다", async () => {
    const before = await stats();
    const { logGateVerdict } = await import("@/lib/observability/gate-log");
    logGateVerdict("HEART_LETTER", { verdict: "NON_BINDING", statutes: [] }, false);
    await new Promise((r) => setTimeout(r, 20)); // 기록은 비동기다

    const after = await stats();
    expect(after.byVerdict.NON_BINDING).toBeGreaterThan(before.byVerdict?.NON_BINDING ?? 0);
    expect(after.blockedTotal).toBe(before.blockedTotal);
  });

  it("응답은 계약을 만족한다 (GateStatsRes)", async () => {
    const d = await stats();
    expect(typeof d.blockedTotal).toBe("number");
    expect(Array.isArray(d.byStatute)).toBe(true);
    expect(d.totalEvaluations).toBeGreaterThanOrEqual(d.blockedTotal);
  });
});
