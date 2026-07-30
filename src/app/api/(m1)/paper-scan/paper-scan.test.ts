// M-PAPER-SCAN 테스트 (FR-401 · NFR-711)
// 픽스처는 전량 가상이다 — 실존 약정서·실인물 금지 (보안 4조).
import { describe, expect, it } from "vitest";
import { addProposal, addUtterance, getOrCreateSession, getSession } from "@/lib/ai/session/store";
import { CONFIDENCE } from "@/lib/ai/extract/confidence";
import { toFields } from "@/lib/ai/document/real/upstage";
import { POST as uploadPost } from "./upload/route";
import { POST as extractPost } from "./extract/route";

async function donationSession() {
  const s = await getOrCreateSession();
  const u = await addUtterance(s.id, "종이로 받은 약정서가 있어요");
  await addProposal(s.id, "DONATION_NOW", "EXPRESS", u.id);
  return s;
}

function upload(opts: { intentId: string; consent: boolean; type?: string; size?: number }) {
  const form = new FormData();
  form.append("intentId", opts.intentId);
  form.append("transferConsent", String(opts.consent));
  const bytes = new Uint8Array(opts.size ?? 32);
  form.append(
    "file",
    new File([bytes], "가상-약정서.png", { type: opts.type ?? "image/png" }),
  );
  return uploadPost(
    new Request("http://localhost/api/paper-scan/upload", { method: "POST", body: form }),
  );
}

const extract = (uploadId: string) =>
  extractPost(
    new Request("http://localhost/api/paper-scan/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId }),
    }),
  );

describe("M-PAPER-SCAN — 외부 전송 동의 (NFR-711)", () => {
  it("동의 없으면 업로드 자체가 거부된다 — 화면 체크박스에 의존하지 않는다", async () => {
    const s = await donationSession();
    const res = await upload({ intentId: s.id, consent: false });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("TRANSFER_CONSENT_REQUIRED");
    expect(body.error.nextAction).toContain("동의");
  });

  it("동의하면 업로드된다", async () => {
    const s = await donationSession();
    const res = await upload({ intentId: s.id, consent: true });
    expect(res.status).toBe(200);
    expect((await res.json()).data.uploadId).toBeTruthy();
  });
});

describe("M-PAPER-SCAN — 판독 → 기존 확정 흐름 합류 (FR-401 · P1)", () => {
  it("판독 결과가 세션 facts로 들어가고 전부 미확정이다", async () => {
    const s = await donationSession();
    const { data } = await (await upload({ intentId: s.id, consent: true })).json();
    const res = await extract(data.uploadId);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.parsedText).toContain("기부 약정서");
    for (const f of body.data.extractedFacts) expect(f.confirmed).toBe(false); // P1

    // 새 확정 경로를 만들지 않았다 — 같은 세션의 facts로 합류한다
    const reloaded = await getSession(s.id);
    expect(reloaded!.facts.find((f) => f.key === "amount")?.value).toBe(300_000);
    expect(reloaded!.facts.find((f) => f.key === "region")?.value).toBe("부산");
  });

  it("종이에서 읽은 값은 MEDIUM — 사람이 원문을 보고 확인하는 것을 전제로 한다", async () => {
    const s = await donationSession();
    const { data } = await (await upload({ intentId: s.id, consent: true })).json();
    const body = await (await extract(data.uploadId)).json();
    const amount = body.data.extractedFacts.find((f: { key: string }) => f.key === "amount");
    expect(amount.confidence).toBe(CONFIDENCE.MEDIUM);
  });

  it("업로드는 1회용 — 같은 uploadId로 두 번 판독할 수 없다 (원본을 오래 두지 않는다)", async () => {
    const s = await donationSession();
    const { data } = await (await upload({ intentId: s.id, consent: true })).json();
    expect((await extract(data.uploadId)).status).toBe(200);
    expect((await extract(data.uploadId)).status).toBe(404);
  });

  it("없는 uploadId → 404", async () => {
    expect((await extract(crypto.randomUUID())).status).toBe(404);
  });
});

describe("M-PAPER-SCAN — 입력 검증", () => {
  it("지원하지 않는 형식 → 415", async () => {
    const s = await donationSession();
    const res = await upload({ intentId: s.id, consent: true, type: "text/plain" });
    expect(res.status).toBe(415);
  });

  it("10MB 초과 → 413", async () => {
    const s = await donationSession();
    const res = await upload({ intentId: s.id, consent: true, size: 11 * 1024 * 1024 });
    expect(res.status).toBe(413);
  });

  it("없는 세션 → 404", async () => {
    const res = await upload({
      intentId: "00000000-0000-4000-8000-0000000000ff",
      consent: true,
    });
    expect(res.status).toBe(404);
  });
});

describe("IE 출력 → 슬롯 정규화", () => {
  it("지역 표기를 정규화하고 금액은 대화와 같은 파서를 쓴다", () => {
    const fields = toFields({ region: "부산광역시", amountText: "금 삼십만원정 (300,000원)" });
    expect(fields.find((f) => f.key === "region")?.value).toBe("부산");
    expect(fields.find((f) => f.key === "amount")?.value).toBe(300_000);
  });

  it("읽지 못한 항목은 만들지 않는다", () => {
    expect(toFields({})).toHaveLength(0);
    expect(toFields({ amountText: "알 수 없음" })).toHaveLength(0);
  });
});
