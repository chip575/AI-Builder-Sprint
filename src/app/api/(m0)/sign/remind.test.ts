// M-SIGN-LIFECYCLE 테스트 — 미서명 리마인드 (FR-507 · NFR-705 · NFR-708)
// 🔴 경로/바디 draftId 불일치는 계약이 강제할 수 없다. 이 파일이 유일한 방어선이다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateGate } from "@/lib/rules/validity-gate";
import { mockSigner } from "@/lib/signer";
import { REMIND_AFTER_MS, tooEarlyCopy, whenAgain } from "@/lib/signer/remind";
import { createDraft, getDraft } from "@/app/api/(m0)/documents/store";
import { POST as signPost } from "./[draftId]/route";
import { POST as remindPost } from "./[draftId]/remind/route";
import { store } from "@/lib/store";
import { DEV_USER_ID } from "@/lib/store/types";

/** 경로와 바디를 **따로** 넘긴다 — 둘을 하나로 묶으면 불일치를 잴 수 없다 */
function remind(pathId: string, bodyId: string = pathId) {
  return remindPost(
    new Request(`http://localhost/api/sign/${pathId}/remind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId: bodyId }),
    }),
    { params: Promise.resolve({ draftId: pathId }) },
  );
}

/** 서명 요청까지 끝난 draft — 리마인드가 성립하는 최소 상태 */
async function requested() {
  const draft = await createDraft(
    await ownedIntent(),
    "DONATION_PLEDGE",
    evaluateGate("DONATION_PLEDGE"),
  );
  await signPost(
    new Request(`http://localhost/api/sign/${draft.draftId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "LINK" }),
    }),
    { params: Promise.resolve({ draftId: draft.draftId }) },
  );
  return (await getDraft(draft.draftId))!;
}

/** Date만 가짜로 만든다 — setTimeout을 건드리면 mock signer의 자동 완료 타이머까지 흔든다 */
function travel(ms: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.now() + ms));
}

const PAST_THRESHOLD = REMIND_AFTER_MS + 60_000;

afterEach(() => vi.useRealTimers());

/** 소유자가 있는 draft를 만든다.
 *  draft는 intent에 매달리고 **소유자는 intent가 안다** — 임의 uuid를 intentId로 쓰면
 *  주인 없는 문서가 되어 소유 확인이 붙은 라우트에서 404가 된다 (2026-08-03). */
async function ownedIntent() {
  return (await store.getOrCreateSession(null, DEV_USER_ID)).id;
}

describe("M-SIGN-LIFECYCLE — 리마인드 대상 식별 (FR-507)", () => {
  it("🔴 경로 A + 바디 B → 400, B에는 아무것도 보내지 않는다", async () => {
    const a = await requested();
    const b = await requested();

    const res = await remind(a.draftId, b.draftId);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("DRAFT_ID_MISMATCH");

    // B가 실제로 무사한가 — 이후 첫 발송이 1이면 위 요청은 B에 닿지 않았다
    travel(PAST_THRESHOLD);
    const after = await (await remind(b.draftId)).json();
    expect(after.data.remindCount).toBe(1);
  });

  it("경로와 바디가 같으면 통과한다 (차단만 재면 '전부 막는 검사'와 구분되지 않는다)", async () => {
    const d = await requested();
    travel(PAST_THRESHOLD);
    const res = await remind(d.draftId, d.draftId);
    expect(res.status).toBe(200);
  });

  it("없는 draft → 404 / 서명 요청 전 draft → 409", async () => {
    expect((await remind(crypto.randomUUID())).status).toBe(404);

    const fresh = await createDraft(
    await ownedIntent(),
      "DONATION_PLEDGE",
      evaluateGate("DONATION_PLEDGE"),
    );
    const res = await remind(fresh.draftId);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NOT_REQUESTED");
  });
});

describe("M-SIGN-LIFECYCLE — 임계 (FR-507 · NFR-705)", () => {
  it("임계 이전 → 보내지 않고 nextAction으로 돌려보낸다", async () => {
    const d = await requested();
    const res = await remind(d.draftId);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("TOO_EARLY");
    expect(body.error.nextAction).toMatch(/다시 보내실 수 있어요/);

    // 발송되지 않았다는 증거 — 임계 이후 첫 발송이 여전히 1회차다
    travel(PAST_THRESHOLD);
    const sent = await (await remind(d.draftId)).json();
    expect(sent.data.remindCount).toBe(1);
  });

  it("보낸 직후 다시 보내려 하면 막는다 — 임계는 매 발송마다 다시 센다 (FR-113)", async () => {
    // 요청 시각만 보면 임계가 한 번 지난 뒤로는 연속 발송이 열린다.
    // 그건 안내가 아니라 독촉이다 — 직전 발송으로부터 다시 임계를 채워야 한다
    const d = await requested();
    travel(PAST_THRESHOLD);

    const first = await (await remind(d.draftId)).json();
    expect(first.ok).toBe(true);
    expect(first.data.remindCount).toBe(1);

    const second = await (await remind(d.draftId)).json();
    expect(second.ok).toBe(false);
    expect(second.error.nextAction).toBeTruthy(); // 실패가 아니라 안내다 (NFR-705)
  });

  it("직전 발송으로부터 임계가 다시 지나면 보낸다 (1 → 2)", async () => {
    const d = await requested();
    travel(PAST_THRESHOLD);
    const first = await (await remind(d.draftId)).json();
    expect(first.data.remindCount).toBe(1);

    travel(PAST_THRESHOLD); // 직전 발송으로부터 다시 임계 경과
    const second = await (await remind(d.draftId)).json();
    expect(second.ok).toBe(true);
    expect(second.data.remindCount).toBe(2);
  });

  it("이미 완료된 문서 → 거부 (외부 상태가 판정 근거다)", async () => {
    const d = await requested();
    await mockSigner!.simulateEvent(d.modusignDocumentId!, "document_all_signed");

    travel(PAST_THRESHOLD);
    const res = await remind(d.draftId);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NOT_PENDING");
  });

  it("거절된 문서 → 거부하되 문구가 사용자를 탓하지 않는다 (FR-506)", async () => {
    const d = await requested();
    await mockSigner!.simulateEvent(d.modusignDocumentId!, "document_rejected");

    travel(PAST_THRESHOLD);
    const body = await (await remind(d.draftId)).json();
    expect(body.error.code).toBe("NOT_PENDING");
    expect(body.error.message).toContain("상대가");
    expect(body.error.nextAction).toBeTruthy();
  });
});

describe("M-SIGN-LIFECYCLE — 문구 (NFR-708)", () => {
  /** 재촉·긴급성 어휘. 하나라도 들어가면 안내가 아니라 독촉이 된다 (FR-113) */
  const URGING = [
    "빨리", "서둘", "즉시", "긴급", "독촉", "재촉", "당장",
    "어서", "바로", "임박", "경고", "반드시", "꼭", "늦",
  ];

  const clean = (s: string) => URGING.filter((w) => s.includes(w));

  it("임계 이전 문구에 재촉 어휘가 없다", () => {
    const now = new Date("2026-07-31T02:00:00.000Z");
    for (const h of [1, 5, 12, 30, 49, 100]) {
      const copy = tooEarlyCopy(new Date(now.getTime() + h * 3_600_000), now);
      expect(clean(`${copy.message} ${copy.nextAction}`)).toEqual([]);
    }
  });

  it("리마인드 경로가 내보내는 모든 문구에 재촉 어휘가 없다", async () => {
    const seen: string[] = [];
    const collect = async (res: Response) => {
      const body = await res.json();
      if (!body.ok) seen.push(`${body.error.message} ${body.error.nextAction}`);
    };

    const a = await requested();
    const b = await requested();
    await collect(await remind(a.draftId, b.draftId)); // 불일치
    await collect(await remind(a.draftId)); // 임계 이전
    await collect(await remind(crypto.randomUUID())); // 없는 문서
    await mockSigner!.simulateEvent(b.modusignDocumentId!, "document_all_signed");
    travel(PAST_THRESHOLD);
    await collect(await remind(b.draftId)); // 완료된 문서

    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) expect(clean(s)).toEqual([]);
  });

  it("남은 시간을 초 단위로 세지 않고 하루 단위 표현으로 안내한다", () => {
    const now = new Date("2026-07-31T02:00:00.000Z"); // KST 11:00
    expect(whenAgain(new Date("2026-07-31T05:00:00.000Z"), now)).toBe("오늘 오후 이후에");
    expect(whenAgain(new Date("2026-08-01T05:00:00.000Z"), now)).toBe("내일 오후 이후에");
    expect(whenAgain(new Date("2026-08-02T05:00:00.000Z"), now)).toBe("모레 오후 이후에");
    expect(whenAgain(new Date("2026-08-05T05:00:00.000Z"), now)).toBe("8월 5일 오후 이후에");
  });
});
