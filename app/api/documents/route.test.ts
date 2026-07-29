// M-DOCUMENTS — 게이트 연동 (FR-104 수락 기준: 서버 차단 + 조문 인용)
// 403-미확정/통과 케이스는 facts.test.ts에 있다 (FR-103 쪽 물증).
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  addProposal,
  addUtterance,
  confirmFacts,
  getOrCreateSession,
  saveFacts,
} from "@/lib/ai/session/store";
import type { IntentFact } from "@/lib/contracts";
import { getDraft } from "./store";
import { POST } from "./route";

function post(intentId: string) {
  return POST(
    new Request("http://localhost/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId }),
    }),
  );
}

const fact = (key: string, value: IntentFact["value"]): IntentFact => ({
  id: randomUUID(),
  key,
  value,
  confidence: 0.95,
  sourceSpan: null,
  confirmed: false,
});

/** 확정까지 끝난 세션 — 실경로(추출→확정)는 facts.test.ts가 검증하므로 여기선 스토어로 준비 */
async function confirmedSession(
  branchType: "DONATION_NOW" | "HANDWRITTEN_WILL" | "LEGACY_GIFT",
) {
  const s = await getOrCreateSession();
  const u = await addUtterance(s.id, "테스트 발화");
  await addProposal(s.id, branchType, "EXPRESS", u.id);
  await saveFacts(s.id, [fact("region", "부산"), fact("amount", 1_000_000)]);
  await confirmFacts(s.id);
  return s;
}

describe("M-DOCUMENTS — 게이트 3분기 (FR-104)", () => {
  it("유언장 가지 → 403 + 민법 조문 인용 + 자필 경로 안내 (P2 물증)", async () => {
    const s = await confirmedSession("HANDWRITTEN_WILL");
    const res = await post(s.id);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("GATE_ESIGN_INVALID");
    expect(body.error.message).toContain("민법 §1066"); // 조문 인용 (수락 기준)
    expect(body.error.nextAction).toContain("자필");    // 대체 경로 라우팅
  });

  it("기부 가지 → ESIGN_OK, draft에 판정 원본 보존", async () => {
    const s = await confirmedSession("DONATION_NOW");
    const res = await post(s.id);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const draft = (await getDraft(data.draftId))!;
    expect(draft.docType).toBe("DONATION_PLEDGE");
    expect(draft.verdict.verdict).toBe("ESIGN_OK");
    expect(draft.status).toBe("DRAFT");
  });

  it("유산기부 가지 → ESIGN_OK지만 유류분 조문이 판정에 실림", async () => {
    const s = await confirmedSession("LEGACY_GIFT");
    const res = await post(s.id);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(
      (await getDraft(data.draftId))!.verdict.statutes.map((x) => x.id),
    ).toContain("민법 §1112");
  });

  it("없는 세션 → 404 / 가지 없는 세션 → 400 NO_BRANCH", async () => {
    expect((await post("00000000-0000-4000-8000-0000000000ee")).status).toBe(404);

    const s = await getOrCreateSession();
    await addUtterance(s.id, "그냥 이야기");
    await saveFacts(s.id, [fact("note", "x")]);
    await confirmFacts(s.id);
    const res = await post(s.id);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("NO_BRANCH");
  });
});
