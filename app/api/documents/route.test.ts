// M-DOCUMENTS — 게이트 연동 (FR-104 수락 기준: 서버 차단 + 조문 인용)
// 403-미확정/통과 케이스는 facts.test.ts에 있다 (FR-103 쪽 물증).
import { describe, expect, it } from "vitest";
import {
  addProposal,
  addUtterance,
  getOrCreateSession,
} from "@/lib/ai/session/store";
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

/** 확정까지 끝난 세션 — confirmed 갱신은 store를 직접 조작하지 않고 시나리오상 가정만 필요하므로
 *  여기서는 fact를 손으로 만들고 확정 플래그를 세운다 (테스트 픽스처, 실경로는 facts.test.ts가 검증) */
function confirmedSession(branchType: "DONATION_NOW" | "HANDWRITTEN_WILL" | "LEGACY_GIFT") {
  const s = getOrCreateSession();
  const u = addUtterance(s, "테스트 발화");
  addProposal(s, branchType, "EXPRESS", u.id);
  s.facts = [
    {
      id: crypto.randomUUID(),
      key: "region",
      value: "부산",
      confidence: 0.95,
      sourceSpan: null,
      confirmed: true,
    },
  ];
  s.missingRequired = [];
  return s;
}

describe("M-DOCUMENTS — 게이트 3분기 (FR-104)", () => {
  it("유언장 가지 → 403 + 민법 조문 인용 + 자필 경로 안내 (P2 물증)", async () => {
    const s = confirmedSession("HANDWRITTEN_WILL");
    const res = await post(s.id);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("GATE_ESIGN_INVALID");
    expect(body.error.message).toContain("민법 §1066"); // 조문 인용 (수락 기준)
    expect(body.error.nextAction).toContain("자필");    // 대체 경로 라우팅
  });

  it("기부 가지 → ESIGN_OK, draft에 판정 원본 보존", async () => {
    const s = confirmedSession("DONATION_NOW");
    const res = await post(s.id);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const draft = getDraft(data.draftId)!;
    expect(draft.docType).toBe("DONATION_PLEDGE");
    expect(draft.verdict.verdict).toBe("ESIGN_OK");
    expect(draft.status).toBe("DRAFT");
  });

  it("유산기부 가지 → ESIGN_OK지만 유류분 조문이 판정에 실림", async () => {
    const s = confirmedSession("LEGACY_GIFT");
    const res = await post(s.id);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(
      getDraft(data.draftId)!.verdict.statutes.map((x) => x.id),
    ).toContain("민법 §1112");
  });

  it("없는 세션 → 404 / 가지 없는 세션 → 400 NO_BRANCH", async () => {
    expect((await post("00000000-0000-4000-8000-0000000000ee")).status).toBe(404);

    const s = getOrCreateSession();
    addUtterance(s, "그냥 이야기");
    s.facts = [
      {
        id: crypto.randomUUID(),
        key: "note",
        value: "x",
        confidence: 0.95,
        sourceSpan: null,
        confirmed: true,
      },
    ];
    const res = await post(s.id);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("NO_BRANCH");
  });
});
