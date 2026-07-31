// M-BRANCH-DETECT 테스트 (FR-115A · FR-115B)
// 이 스위트가 지키는 명제는 하나다 — **AI는 가지를 열지 않는다.**
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BranchSignal, DetectInput } from "./port";

// 감지 어댑터는 갈아끼울 수 있어야 한다 — 모델이 지어낸 근거를 재현해야 하기 때문이다.
// 기본 구현은 mock 감지기 그대로다 (결정론).
const stub = vi.hoisted(() => ({
  impl: null as ((input: DetectInput) => Promise<BranchSignal[]>) | null,
}));
vi.mock("./detect", () => ({
  detector: { detect: (input: DetectInput) => stub.impl!(input) },
}));

// vi.mock은 정적 import보다 위로 끌어올려진다 — 아래 모듈들이 보는 "./detect"는 위의 대역이다
import { MockDetector } from "./mock-detector";
import { createProposal, proposeBranches } from "./propose";
import { NEXT_STEP, resolveDecision } from "./decide";
import { store } from "@/lib/store";
import { addUtterance, getOrCreateSession } from "../session/store";

const mock = new MockDetector();

beforeEach(() => {
  stub.impl = (input) => mock.detect(input);
});

/** 제안 정확히 1건을 단언하고 그 하나를 준다 */
function only<T>(items: T[]): T {
  expect(items).toHaveLength(1);
  const [first] = items;
  if (!first) throw new Error("제안이 없습니다");
  return first;
}

/** 세션 하나에 발화 하나 — 근거 발화가 실재하는 정상 상태를 만든다 */
async function sessionWith(text: string, userId: string) {
  const session = await getOrCreateSession(null, userId);
  const utterance = await addUtterance(session.id, text);
  return { session, utterance, utterances: [utterance] };
}

describe("FR-115A — 근거 발화 없는 제안은 생성 자체가 금지된다", () => {
  it("근거 발화 id 없이 제안을 만들려 하면 거부한다", async () => {
    await expect(
      createProposal({
        sessionId: "00000000-0000-4000-8000-000000000001",
        userId: "00000000-0000-4000-8000-0000000000aa",
        branchType: "DONATION_NOW",
        origin: "DETECTED",
        sourceUtteranceId: "",
      }),
    ).rejects.toThrow(/근거 발화/);
  });

  it("감지기가 실재하지 않는 발화를 근거로 대면 제안하지 않는다", async () => {
    const { session, utterances } = await sessionWith(
      "부산에 기부하고 싶어요",
      "00000000-0000-4000-8000-0000000000ab",
    );
    // 모델이 근거를 지어낸 상황 — 그 발화는 이 대화에 없다
    stub.impl = async () => [
      {
        branchType: "DONATION_NOW",
        sourceUtteranceId: "00000000-0000-4000-8000-00000000dead",
      },
    ];
    const made = await proposeBranches({
      sessionId: session.id,
      userId: session.userId,
      utterances,
    });
    expect(made).toEqual([]);
  });
});

describe("FR-115A — 닫은 가지는 다시 제안하지 않는다", () => {
  it("DECLINE한 가지는 다른 세션에서 같은 신호가 잡혀도 제안되지 않는다", async () => {
    const userId = "00000000-0000-4000-8000-0000000000ac";
    const first = await sessionWith("부산에 기부하고 싶어요", userId);

    const made = await proposeBranches({
      sessionId: first.session.id,
      userId,
      utterances: first.utterances,
    });
    const proposal = only(made);
    expect(proposal.branchType).toBe("DONATION_NOW");

    // 사용자가 닫는다 — 결정은 **영속 기록**에 남는다.
    // 메모리 사본에만 쓰면 인스턴스가 갈릴 때 거절이 되살아난다 (FR-115A)
    await store.decideProposal(proposal.id, "DECLINED");

    // 며칠 뒤 새 세션에서 같은 이야기를 다시 한다
    const later = await sessionWith("부산에 기부하고 싶어요", userId);
    const again = await proposeBranches({
      sessionId: later.session.id,
      userId,
      utterances: later.utterances,
    });
    expect(again).toEqual([]);
  });

  it("같은 세션에서 같은 가지를 두 번 묻지 않는다", async () => {
    const userId = "00000000-0000-4000-8000-0000000000ad";
    const { session, utterance } = await sessionWith("부산에 기부하고 싶어요", userId);
    const second = await addUtterance(session.id, "부산에 기부하고 싶어요");

    const first = await proposeBranches({
      sessionId: session.id,
      userId,
      utterances: [utterance],
    });
    expect(first).toHaveLength(1);

    const again = await proposeBranches({
      sessionId: session.id,
      userId,
      utterances: [utterance, second],
    });
    expect(again).toEqual([]);
  });
});

describe("FR-115A/B — 무게 등급별 결정", () => {
  it("HEAVY + DETECTED + ACCEPT → PENDING_RECONFIRM (바로 열리지 않는다)", () => {
    for (const branchType of ["LEGACY_GIFT", "HANDWRITTEN_WILL"] as const) {
      const res = resolveDecision({ branchType, origin: "DETECTED" }, "ACCEPT");
      expect(res.status).toBe("PENDING_RECONFIRM");
      expect(res.nextStep).toBe(NEXT_STEP.NEXT_SESSION_RECONFIRM);
    }
  });

  it("LIGHT + ACCEPT → OPENED", () => {
    for (const branchType of ["DONATION_NOW", "HERITAGE_SUPPORT"] as const) {
      const res = resolveDecision({ branchType, origin: "DETECTED" }, "ACCEPT");
      expect(res.status).toBe("OPENED");
      expect(res.nextStep).toBe(NEXT_STEP.SLOT_DIALOG);
    }
  });

  it("MEDIUM(ESTATE) + ACCEPT → OPENED", () => {
    expect(resolveDecision({ branchType: "ESTATE", origin: "DETECTED" }, "ACCEPT").status)
      .toBe("OPENED");
  });

  it("HEAVY + EXPRESS + ACCEPT → 재확인이 아니라 숙려 화면 (FR-115B)", () => {
    const res = resolveDecision(
      { branchType: "HANDWRITTEN_WILL", origin: "EXPRESS" },
      "ACCEPT",
    );
    expect(res.status).toBe("PENDING_RECONFIRM");
    expect(res.nextStep).toBe(NEXT_STEP.DELIBERATION);
  });

  it("숙려 화면을 거친 PROCEED_TODAY만 무거운 가지를 당일 연다", () => {
    expect(
      resolveDecision({ branchType: "HANDWRITTEN_WILL", origin: "EXPRESS" }, "PROCEED_TODAY")
        .status,
    ).toBe("OPENED");
    expect(
      resolveDecision({ branchType: "HANDWRITTEN_WILL", origin: "EXPRESS" }, "PROCEED_LATER")
        .status,
    ).toBe("DEFERRED");
  });

  it('DEFER는 거절이 아니다 — "나중에"는 DEFERRED다 (P4)', () => {
    expect(resolveDecision({ branchType: "DONATION_NOW", origin: "DETECTED" }, "DEFER").status)
      .toBe("DEFERRED");
    expect(
      resolveDecision({ branchType: "DONATION_NOW", origin: "DETECTED" }, "DECLINE").status,
    ).toBe("DECLINED");
  });
});

describe("NFR-708 — 제안 문구는 확인형이다", () => {
  // 권유·설득·긴급성 어휘. FR-113 수락 기준의 금칙어를 포함한다
  const BANNED = [
    "지금",
    "빨리",
    "서둘",
    "놓치",
    "늦기 전에",
    "기회",
    "추천",
    "권해",
    "권합니다",
    "꼭",
    "반드시",
    "해야",
    "하세요",
    "중요",
    "!",
  ];

  it("모든 가지의 제안 문구에 권유·긴급성 어휘가 없다", async () => {
    const userId = "00000000-0000-4000-8000-0000000000ae";
    const texts: Record<string, string> = {
      DONATION_NOW: "부산에 기부하고 싶어요",
      HERITAGE_SUPPORT: "문화유산을 후원하고 싶어요",
      LEGACY_GIFT: "세상을 떠나면 유산 기부를 하고 싶어요",
      HANDWRITTEN_WILL: "유언장을 쓰고 싶어요",
      ESTATE: "재산을 정리하고 싶어요",
    };

    for (const [branchType, text] of Object.entries(texts)) {
      // 가지마다 새 세션 — 세션당 1회 규칙에 걸리지 않게 격리한다
      const { session, utterances } = await sessionWith(text, userId);
      const made = await proposeBranches({
        sessionId: session.id,
        userId: session.userId,
        utterances,
      });
      const proposal = only(made);
      expect(proposal.branchType).toBe(branchType);

      const message = proposal.message;
      for (const word of BANNED) {
        expect(message, `${branchType} 문구에 "${word}"`).not.toContain(word);
      }
      // 확인형 — 사용자에게 묻고 끝난다
      expect(message.trimEnd().endsWith("?")).toBe(true);
    }
  });
});
