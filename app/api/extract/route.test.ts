// M-EXTRACT 픽스처 4케이스 (FR-102 수락 기준)
import { describe, expect, it } from "vitest";
import { CONFIDENCE, needsReask } from "@/lib/ai/extract/confidence";
import {
  addProposal,
  addUtterance,
  getOrCreateSession,
} from "@/lib/ai/session/store";
import { IntentFactList } from "@/lib/contracts";
import { POST } from "./route";

async function donationSession(...texts: string[]) {
  const s = await getOrCreateSession();
  const first = await addUtterance(s.id, texts[0] ?? "부산에 기부하고 싶어요");
  await addProposal(s.id, "DONATION_NOW", "EXPRESS", first.id);
  for (const t of texts.slice(1)) await addUtterance(s.id, t);
  return s;
}

async function extract(intentId: string) {
  const res = await POST(
    new Request("http://localhost/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId }),
    }),
  );
  return { res, body: await res.json() };
}

describe("M-EXTRACT — 픽스처 4케이스", () => {
  it('"100만원이요" → amount 1,000,000 · HIGH · sourceSpan 있음', async () => {
    const s = await donationSession("부산에 기부하고 싶어요", "100만원이요");
    const { body } = await extract(s.id);
    const data = IntentFactList.parse(body.data); // 계약 준수 검증
    const amount = data.facts.find((f) => f.key === "amount");
    expect(amount?.value).toBe(1_000_000);
    expect(amount?.confidence).toBe(CONFIDENCE.HIGH);
    expect(amount?.sourceSpan?.text).toBe("100만원");
    expect(needsReask(amount!.confidence)).toBe(false);
  });

  it('"한 십만원쯤" → 100,000 · MEDIUM · 되묻기 대상', async () => {
    const s = await donationSession("부산에 기부하고 싶어요", "한 십만원쯤 생각해요");
    const { body } = await extract(s.id);
    const amount = body.data.facts.find((f: { key: string }) => f.key === "amount");
    expect(amount.value).toBe(100_000);
    expect(amount.confidence).toBe(CONFIDENCE.MEDIUM);
    expect(needsReask(amount.confidence)).toBe(true); // 확인 화면에서 강조 + 되묻기
  });

  it("기부처(지역) 미언급 → missingRequired에 region", async () => {
    const s = await getOrCreateSession();
    const u = await addUtterance(s.id, "기부하고 싶어요");
    await addProposal(s.id, "DONATION_NOW", "EXPRESS", u.id);
    await addUtterance(s.id, "100만원이요");
    const { body } = await extract(s.id);
    expect(body.data.missingRequired).toContain("region");
    expect(body.data.missingRequired).not.toContain("amount");
  });

  it("모든 fact는 confirmed=false로 시작한다 (P1)", async () => {
    const s = await donationSession("부산에 100만원 기부하고 싶어요");
    const { body } = await extract(s.id);
    expect(body.data.facts.length).toBeGreaterThan(0);
    for (const f of body.data.facts) expect(f.confirmed).toBe(false);
  });
});

describe("M-EXTRACT — 경계", () => {
  it("나중 발화가 이전 값을 정정한다 (같은 key는 최신이 이김)", async () => {
    const s = await donationSession(
      "부산에 기부하고 싶어요",
      "한 십만원쯤",
      "아니, 30만원으로 할게요",
    );
    const { body } = await extract(s.id);
    const amount = body.data.facts.find((f: { key: string }) => f.key === "amount");
    expect(amount.value).toBe(300_000);
    expect(amount.confidence).toBe(CONFIDENCE.HIGH);
  });

  it("없는 세션 → 404 envelope", async () => {
    const { res, body } = await extract("00000000-0000-4000-8000-00000000dead");
    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.nextAction).toBeTruthy();
  });
});
