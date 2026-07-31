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

describe("🔴 M-DOCUMENTS — 게이트가 확정보다 먼저다", () => {
  // 순서가 뒤집히면 "항목을 확인해 주세요" → 확인 → "그런데 전자서명이 안 됩니다"가 되어
  // **무효인 걸 알면서 확정부터 시키는** 흐름이 된다. 게이트도 확정 검사도 각각은 정상이라
  // 유닛으로는 영영 안 잡히던 조합이다 — 순서 자체를 물증으로 고정한다
  async function unconfirmedSession(branchType: "HANDWRITTEN_WILL" | "DONATION_NOW") {
    const s = await getOrCreateSession();
    const u = await addUtterance(s.id, "유언장을 준비하고 싶어요");
    await addProposal(s.id, branchType, "EXPRESS", u.id);
    return s; // facts 없음 = 미확정 상태
  }

  it("유언장 가지는 항목이 하나도 확정되지 않아도 게이트로 막힌다", async () => {
    const s = await unconfirmedSession("HANDWRITTEN_WILL");
    const res = await post(s.id);
    expect(res.status).toBe(403);
    const body = await res.json();
    // 뒤집혀 있으면 여기서 FACTS_UNCONFIRMED가 나오고 게이트 차단 화면은 영영 안 뜬다
    expect(body.error.code).toBe("GATE_ESIGN_INVALID");
    expect(body.error.route).toContain("/will/handwriting");
  });

  it("게이트를 통과하는 가지는 여전히 확정을 요구한다 — 순서를 바꿨다고 확정이 면제되지 않는다", async () => {
    const s = await unconfirmedSession("DONATION_NOW");
    const res = await post(s.id);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FACTS_UNCONFIRMED");
  });
});

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
