// M-HANDWRITING — 필사 가이드 (FR-302)
//
// 이 화면은 **게이트가 막은 사용자의 목적지**다. 여기서 403이 나면 서비스는
// "안 됩니다"만 말하고 대안을 주지 않은 것이 된다 — 창의성의 연결부가 끊긴다.
// 그래서 "언제 막고 언제 주는가"를 쌍으로 고정한다.
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
import { GET } from "./route";

const fact = (key: string, value: IntentFact["value"]): IntentFact => ({
  id: randomUUID(),
  key,
  value,
  confidence: 0.95,
  sourceSpan: null,
  confirmed: false,
});

function get(id: string) {
  return GET(new Request(`http://localhost/api/will/draft/${id}/print`), {
    params: Promise.resolve({ id }),
  });
}

/** "유언장을 준비하고 싶어요" 한 마디만 한 상태 — 항목이 하나도 없다 */
async function bareWillSession() {
  const s = await getOrCreateSession();
  const u = await addUtterance(s.id, "유언장을 준비하고 싶어요");
  await addProposal(s.id, "HANDWRITTEN_WILL", "EXPRESS", u.id);
  return s;
}

describe("🔴 필사 가이드 — 막는 경우와 주는 경우", () => {
  it("항목이 아예 없으면 빈칸 서식을 준다 — 게이트가 보낸 사용자가 막히지 않게", async () => {
    const s = await bareWillSession();
    const res = await get(s.id);
    expect(res.status).toBe(200);

    const { data } = await res.json();
    expect(data.checklist).toHaveLength(4); // 4요건은 항목과 무관하게 유효하다
    expect(data.statutes.map((x: { id: string }) => x.id)).toContain("민법 §1066");
    // 손으로 자서해야 하는 세 자리는 빈칸으로 남아 있어야 한다
    expect(data.draftText).toContain("작성일");
    expect(data.draftText).toContain("(인)");
  });

  it("항목이 있는데 전부 미확정이면 막는다 — 확인 안 된 산출물을 종이에 인쇄하지 않는다", async () => {
    const s = await bareWillSession();
    await saveFacts(s.id, [fact("region", "부산"), fact("amount", 1_000_000)]);

    const res = await get(s.id);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FACTS_UNCONFIRMED");
  });

  it("확정되면 그 내용이 초안에 들어간다", async () => {
    const s = await bareWillSession();
    await saveFacts(s.id, [fact("region", "부산"), fact("amount", 1_000_000)]);
    await confirmFacts(s.id);

    const res = await get(s.id);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.draftText).toContain("부산");
    expect(data.draftText).toContain("1,000,000");
  });

  it("어떤 경우에도 서명 필드를 내보내지 않는다 (민법 §1066)", async () => {
    const s = await bareWillSession();
    const body = JSON.stringify(await (await get(s.id)).json());
    expect(body).not.toMatch(/signUrl|embedUrl|modusign/i);
  });
});
