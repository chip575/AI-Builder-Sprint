// Express Lane 판정 (FR-115B · D-05) — 패턴 매칭은 코드, 애매한 것만 Solar.
//
// 왜 코드인가: ① mock 모드에서 결정론적이어야 한다 (예선 에이전트 3회 실행 동일 결과)
// ② 데모 문장("부산에 기부하고 싶어요")이 LLM 판정에 걸리면 시연이 도박이 된다.
// 여기서 EXPRESS로 확정되면 Solar를 부르지 않는다. UNCERTAIN만 LLM 분류로 넘긴다.
// ⚠ human_review: required — lib/rules 소속. 에이전트 단독 변경 금지 (보안 5조).
import type { BranchType } from "../contracts/common";

export type ExpressDetection =
  | { kind: "EXPRESS"; branchType: BranchType }
  // 대상은 있는데 의지가 안 보임. **어느 가지의 신호였는지 함께 돌려준다** —
  // 이 값을 버리면 소비하는 쪽이 확인 문구를 만들 수 없어 신호가 통째로 사라진다.
  // (실제로 "부산에 기부는 어떻게 해?"가 아무 데도 닿지 못하고 축으로 떨어졌다)
  | { kind: "UNCERTAIN"; branchType: BranchType }
  | { kind: "NONE" };     // 신호 없음 → 축(회상 인터뷰) 시작

interface Rule {
  branchType: BranchType;
  /** 대상 — 무엇에 대한 발화인가 */
  target: RegExp;
  /** 행위 의지 — 하겠다는 말인가 */
  intent: RegExp;
}

// 순서 중요: 구체적인 것 먼저. "문화유산 후원"은 DONATION_NOW의 "후원"에도 걸리고
// "유산 기부"는 "기부"에도 걸린다 — 앞선 규칙이 이긴다 (00.2 §7.2 혼용 금지).
const RULES: Rule[] = [
  {
    branchType: "HANDWRITTEN_WILL",
    target: /유언/,
    intent: /(쓰|준비|작성|만들|남기)/,
  },
  {
    branchType: "LEGACY_GIFT",
    target: /(유산\s*기부|사후\s*기부|떠나(면|고 나면)|세상을 떠난)/,
    intent: /(남기|기부|보태|하고\s*싶)/,
  },
  {
    branchType: "HERITAGE_SUPPORT",
    target: /(문화유산|문화재)/,
    intent: /(후원|지키|보태|기부|쓰였으면)/,
  },
  {
    branchType: "DONATION_NOW",
    target: /(기부|성금|후원)/,
    intent: /(하고\s*싶|하려|할래|하고자|보태|내고\s*싶)/,
  },
  {
    branchType: "ESTATE",
    target: /(자산|재산|뭐가 어디)/,
    intent: /(정리|목록|파악)/,
  },
];

/**
 * 첫 발화의 Express 판정. 대상 + 행위 의지가 한 발화에 모두 드러나야 EXPRESS다.
 * "뭔가 남기고 싶어요"처럼 대상이 없는 발화는 EXPRESS가 아니다 — 축으로 시작한다.
 */
export function detectExpress(text: string): ExpressDetection {
  let targetOnly: BranchType | null = null;
  for (const rule of RULES) {
    const hasTarget = rule.target.test(text);
    const hasIntent = rule.intent.test(text);
    if (hasTarget && hasIntent) return { kind: "EXPRESS", branchType: rule.branchType };
    // 규칙 순서가 곧 우선순위다 — 먼저 맞은 것을 남긴다 ("유산 기부"가 "기부"보다 앞)
    if (hasTarget && targetOnly === null) targetOnly = rule.branchType;
  }
  // 대상 언급은 있는데 의지가 안 보이면 애매 — 확인형 제안으로 넘긴다 (FR-115A)
  return targetOnly ? { kind: "UNCERTAIN", branchType: targetOnly } : { kind: "NONE" };
}
