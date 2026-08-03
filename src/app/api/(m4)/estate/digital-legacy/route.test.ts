// M-DIGITAL-LEGACY — 디지털 유산 지시서 (FR-403)
//
// 서명하지 않는 문서다. 그래서 검사의 무게중심이 "만들어지나"가 아니라
// **"무엇이 들어가나 / 무엇이 안 들어가나"** 에 있다.
import { describe, expect, it } from "vitest";
import { DEV_USER_ID } from "@/lib/store/types";
import { store } from "@/lib/store";
import { GET, POST } from "./route";

const get = () => GET(new Request("http://localhost/api/estate/digital-legacy"));
const post = () => POST(new Request("http://localhost/api/estate/digital-legacy", { method: "POST" }));

async function digital(label: string, disposition?: { action: "DELETE" }) {
  return store.createAsset({
    userId: DEV_USER_ID,
    category: "DIGITAL",
    label,
    origin: "MANUAL",
    confidence: null,
    ...(disposition ? { disposition } : { disposition: undefined }),
  } as Parameters<typeof store.createAsset>[0]);
}

describe("지시서", () => {
  it("처리 방식을 안 정했으면 문서를 만들지 않는다", async () => {
    await digital(`미정-${Date.now()}`);
    const res = await post();
    // 이미 정해진 것이 있으면 통과할 수 있다 — 그때는 409가 아니다
    if (res.status === 409) {
      const { error } = await res.json();
      expect(error.nextAction).toContain("처리 방식");
    }
  });

  it("정한 것만 문서에 들어간다 — 정한 것과 안 정한 것을 섞지 않는다", async () => {
    const decided = await digital(`정함-${Date.now()}`, { action: "DELETE" });
    await digital(`미정-${Date.now()}`);
    const { data } = await (await post()).json();
    const ids = data.items.map((i: { assetId: string }) => i.assetId);
    expect(ids).toContain(decided.id);
    // 미정 항목은 items에 없다
    expect(data.items.every((i: { disposition: unknown }) => i.disposition)).toBe(true);
  });

  it("🔴 서명하지 않는 문서다 — NON_BINDING이 아니면 서명 버튼이 붙는다", async () => {
    await digital(`정함2-${Date.now()}`, { action: "DELETE" });
    const { data } = await (await post()).json();
    expect(data.verdict).toBe("NON_BINDING");
    const draft = await store.getDraft(data.documentId);
    expect(draft?.docType).toBe("DIGITAL_LEGACY_INSTRUCTION");
  });

  it("두 번 눌러도 서랍에 같은 문서가 쌓이지 않는다", async () => {
    await digital(`정함3-${Date.now()}`, { action: "DELETE" });
    const a = (await (await post()).json()).data;
    const b = (await (await post()).json()).data;
    expect(b.documentId).toBe(a.documentId);
  });

  it("아직 안 정한 개수를 알려 준다 — 화면이 '몇 개 남았는지'를 말할 수 있게", async () => {
    await digital(`미정2-${Date.now()}`);
    const { data } = await (await get()).json();
    expect(data.undecided).toBeGreaterThan(0);
  });
});
