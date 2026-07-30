// M-HANDWRITING 테스트 (FR-302 · 민법 §1066)
// 이 모듈의 핵심 산출물은 기능이 아니라 **부재**다 — 서명할 방법이 없다는 것.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addProposal,
  addUtterance,
  confirmFacts,
  getOrCreateSession,
  saveFacts,
} from "@/lib/ai/session/store";
import { buildDraftText, HANDWRITING_CHECKLIST } from "@/lib/rules/handwriting-guide";
import type { IntentFact } from "@/lib/contracts";
import { GET } from "./draft/[id]/print/route";

const fact = (key: string, value: IntentFact["value"]): IntentFact => ({
  id: randomUUID(),
  key,
  value,
  confidence: 0.95,
  sourceSpan: null,
  confirmed: false,
});

async function willSession(confirm = true) {
  const s = await getOrCreateSession();
  const u = await addUtterance(s.id, "유언장을 준비하고 싶어요");
  await addProposal(s.id, "HANDWRITTEN_WILL", "EXPRESS", u.id);
  await saveFacts(s.id, [fact("region", "부산"), fact("amount", 1_000_000)]);
  if (confirm) await confirmFacts(s.id);
  return s;
}

const print = (id: string) =>
  GET(new Request(`http://localhost/api/will/draft/${id}/print`), {
    params: Promise.resolve({ id }),
  });

describe("M-HANDWRITING — 서명 버튼은 존재하지 않는다 (FR-302 수락 기준)", () => {
  it("응답 어디에도 서명 관련 필드가 없다", async () => {
    const s = await willSession();
    const { data } = await (await print(s.id)).json();
    const serialized = JSON.stringify(data);
    for (const banned of ["signUrl", "embedUrl", "signRequest", "modusign", "expiresAt"]) {
      expect(serialized).not.toContain(banned);
    }
    expect(Object.keys(data).sort()).toEqual(["checklist", "draftText", "statutes"]);
  });

  it("화면 소스에 서명 버튼·서명 API 호출이 없다", () => {
    const page = readFileSync(
      "src/app/(ui)/(m2)/will/handwriting/page.tsx",
      "utf-8",
    );
    expect(page).not.toContain("/api/sign");
    expect(page).not.toMatch(/서명\s*(요청|하기)/); // "서명 요청"·"서명하기" 버튼 금지
  });
});

describe("M-HANDWRITING — 초안 (민법 §1066)", () => {
  it("최상단 고지와 민법 제1066조가 화면에 있다", () => {
    const page = readFileSync("src/app/(ui)/(m2)/will/handwriting/page.tsx", "utf-8");
    expect(page).toContain("손으로 옮겨 적어야 효력이 있습니다");
    expect(page).toContain("민법 제1066조");
  });

  it("날짜·주소·성명은 빈칸으로 남는다 — 그 자리를 본인이 자서해야 한다", () => {
    const text = buildDraftText({
      facts: [
        { key: "region", value: "부산" },
        { key: "amount", value: 1_000_000 },
      ],
    });
    expect(text).toContain("작성일   ____년 ____월 ____일");
    expect(text).toContain("주소     ___");
    expect(text).toContain("(인)");
    expect(text).toContain("부산");
    expect(text).toContain("1,000,000원");
  });

  it("근거 조문이 응답에 실린다 (P3)", async () => {
    const s = await willSession();
    const { data } = await (await print(s.id)).json();
    const ids = data.statutes.map((x: { id: string }) => x.id);
    expect(ids).toContain("민법 §1066");
    expect(ids).toContain("대법원 2006다25103·25110");
  });
});

describe("M-HANDWRITING — 체크리스트 (FR-302)", () => {
  it("4항목이고 각각 무효 판례 근거가 붙는다", async () => {
    const s = await willSession();
    const { data } = await (await print(s.id)).json();
    expect(data.checklist).toHaveLength(4);
    expect(data.checklist.map((c: { id: string }) => c.id)).toEqual([
      "FULL_TEXT",
      "DATE",
      "ADDRESS",
      "NAME_SEAL",
    ]);
    for (const c of data.checklist) {
      expect(c.checked).toBe(false); // 처음엔 전부 미확인
      expect(c.caseNote.length).toBeGreaterThan(10);
    }
  });

  it("판례 근거가 실제 무효 원인 셋을 각각 짚는다", () => {
    const notes = HANDWRITING_CHECKLIST.map((c) => c.caseNote).join(" ");
    expect(notes).toContain("주소를 자서하지 않으면");
    expect(notes).toContain("날인이 없는");
    expect(notes).toContain("길일");
  });
});

describe("M-HANDWRITING — P1", () => {
  it("미확정 상태로는 초안을 만들지 않는다", async () => {
    const s = await willSession(false);
    const res = await print(s.id);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FACTS_UNCONFIRMED");
  });

  it("없는 세션 → 404", async () => {
    expect((await print(randomUUID())).status).toBe(404);
  });
});
