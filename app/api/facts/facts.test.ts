// M-FACTS-CONFIRM 픽스처 5케이스 (FR-103)
import { describe, expect, it, vi } from "vitest";
import { extractor } from "@/lib/ai/extract";
import {
  addProposal,
  addUtterance,
  getOrCreateSession,
  type SessionRecord,
} from "@/lib/ai/session/store";
import { POST as extractPost } from "@/app/api/extract/route";
import { POST as documentsPost } from "@/app/api/documents/route";
import { PATCH } from "./[id]/route";
import { POST as confirmPost } from "./confirm/route";

/** 부산 + 100만원 기부 세션을 만들고 추출까지 끝낸 상태를 준비 */
async function extractedSession(...texts: string[]): Promise<SessionRecord> {
  const s = getOrCreateSession();
  const first = addUtterance(s, texts[0] ?? "부산에 100만원 기부하고 싶어요");
  addProposal(s, "DONATION_NOW", "EXPRESS", first.id);
  for (const t of texts.slice(1)) addUtterance(s, t);
  await extractPost(
    new Request("http://localhost/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId: s.id }),
    }),
  );
  return s;
}

function patch(factId: string, body: unknown) {
  return PATCH(
    new Request(`http://localhost/api/facts/${factId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: factId }) },
  );
}

function confirm(intentId: string) {
  return confirmPost(
    new Request("http://localhost/api/facts/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId }),
    }),
  );
}

describe("M-FACTS-CONFIRM — 픽스처 5케이스", () => {
  it("금액 수정 → recalc 포함, formula 3구간 (계산은 lib/rules)", async () => {
    const s = await extractedSession();
    const amount = s.facts.find((f) => f.key === "amount")!;
    const res = await patch(amount.id, { value: 500_000 });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.fact.value).toBe(500_000);
    expect(body.data.recalc.field).toBe("expectedDeduction");
    expect(body.data.recalc.oldValue).toBe(276_000); // 100만원 검산값
    // 구간 3개가 " + "로 이어지고 "="로 끝난다
    expect(body.data.recalc.formula.split(" + ")).toHaveLength(3);
    expect(body.data.recalc.formula).toContain("=");
    expect(body.data.recalc.formula).toContain("전액");
  });

  it("기부처 수정 → recalc undefined", async () => {
    const s = await extractedSession();
    const region = s.facts.find((f) => f.key === "region")!;
    const res = await patch(region.id, { value: "울산" });
    const body = await res.json();
    expect(body.data.fact.value).toBe("울산");
    expect(body.data.recalc).toBeUndefined();
  });

  it("PATCH·confirm은 재추출을 일으키지 않는다", async () => {
    const s = await extractedSession();
    const spy = vi.spyOn(extractor, "extract");
    await patch(s.facts[0]!.id, { value: 200_000 });
    await confirm(s.id);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // P1의 물증 — 확인 버튼을 누르지 않으면 서버가 거부한다 (FR-103 수락 기준)
  it("미확정 상태로 문서 생성 → 403", async () => {
    const s = await extractedSession();
    const res = await documentsPost(
      new Request("http://localhost/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId: s.id }),
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FACTS_UNCONFIRMED");
  });

  it("확인(confirm) 후 문서 생성 → 통과", async () => {
    const s = await extractedSession();
    await confirm(s.id);
    const res = await documentsPost(
      new Request("http://localhost/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId: s.id }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.draftId).toBeTruthy();
    expect(body.data.pdfUrl).toContain(body.data.draftId);
  });

  it("confirm → 전 fact 확정, PATCH는 확정 상태를 만들지 못한다 (P1)", async () => {
    const s = await extractedSession();
    await patch(s.facts.find((f) => f.key === "amount")!.id, { value: 300_000 });
    expect(s.facts.every((f) => !f.confirmed)).toBe(true); // PATCH로는 확정 불가

    const res = await confirm(s.id);
    const body = await res.json();
    expect(body.data.confirmedCount).toBe(s.facts.length);
    expect(s.facts.every((f) => f.confirmed)).toBe(true);
  });
});

describe("M-FACTS-CONFIRM — 경계", () => {
  it("필수 슬롯 미완 세션의 confirm → 422 FACTS_INCOMPLETE", async () => {
    const s = await extractedSession("기부하고 싶어요", "100만원이요"); // 지역 없음
    const res = await confirm(s.id);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("FACTS_INCOMPLETE");
    expect(body.error.nextAction).toContain("region");
  });

  it("필수 슬롯을 PATCH로 null 비우면 confirm이 거부한다 — 확정 시점 재검증 (FR-102)", async () => {
    const s = await extractedSession();
    const region = s.facts.find((f) => f.key === "region")!;
    await patch(region.id, { value: null });
    const res = await confirm(s.id);
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("FACTS_INCOMPLETE");
  });

  it("확정 후 값을 수정하면 확정이 무효 → 문서 생성 403, 재확정 후 통과 (P1)", async () => {
    const s = await extractedSession();
    await confirm(s.id);
    const amount = s.facts.find((f) => f.key === "amount")!;
    await patch(amount.id, { value: 700_000 }); // 확정 후 수정
    const doc = (intentId: string) =>
      documentsPost(
        new Request("http://localhost/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intentId }),
        }),
      );
    expect((await doc(s.id)).status).toBe(403);
    await confirm(s.id); // 재확정
    expect((await doc(s.id)).status).toBe(200);
  });

  it("amount에 숫자가 아닌 값 → 400", async () => {
    const s = await extractedSession();
    const amount = s.facts.find((f) => f.key === "amount")!;
    const res = await patch(amount.id, { value: "많이요" });
    expect(res.status).toBe(400);
  });
});
