// 인벤토리 집계에서 **자산과 채무를 가르는 한 곳** (FR-401 · FR-402)
//
// 왜 따로 뽑았나: 같은 규칙이 두 곳에서 필요하다 —
//   · 대화가 말하는 문장 (lib/ai/prompts/asset-readback)
//   · 화면이 보여주는 현황 (app/(ui)/(m4)/estate/AssetStatus)
// 각자 계산하면 언젠가 갈라지고, 그때 사용자는 **같은 재산에 대해 두 개의 합계**를
// 듣는다. 어느 쪽이 맞는지 알 방법이 없는 것이 가장 나쁜 상태다.
//
// 두 가지 규칙만 갖는다. 둘 다 "틀린 숫자를 보여주느니 안 보여준다"는 쪽이다:
//   ① 채무는 자산 합계에 더하지 않는다 — 상속은 채무도 승계하지만 그건 빼는 쪽이라,
//      한 줄에 섞으면 재산이 실제와 **반대 방향**으로 틀린다.
//   ② 금액 미상이 하나라도 섞이면 합계는 null이다 — summarize()가 카테고리별로 지키는
//      규칙을 전체 합계에도 그대로 적용한다. 부분 합계를 전체인 척 보여주면 사용자는
//      "이게 내 재산의 전부"라고 읽고, 그 오해가 가장 비싸다.
import type { CategoryRollup, InventorySummary } from "../contracts";

export interface OwnedRollup {
  /** 채무를 뺀 카테고리들. 표시 순서는 summarize()가 정한 그대로다 */
  owned: CategoryRollup[];
  /** 채무 — 있으면 따로 보여준다. 숨기지 않는다 */
  debt: CategoryRollup | undefined;
  /** 채무를 뺀 건수 */
  ownedCount: number;
  /** 채무를 뺀 합계. 금액 미상이 섞였거나 자산이 0건이면 null = "낼 수 없음"(0원이 아니다) */
  total: number | null;
}

export function ownedRollup(summary: InventorySummary): OwnedRollup {
  const owned = summary.byCategory.filter((c) => c.category !== "DEBT");
  const debt = summary.byCategory.find((c) => c.category === "DEBT");
  const ownedCount = owned.reduce((s, c) => s + c.count, 0);
  const allKnown = owned.length > 0 && owned.every((c) => c.estimatedTotalKrw != null);

  return {
    owned,
    debt,
    ownedCount,
    total: allKnown ? owned.reduce((s, c) => s + (c.estimatedTotalKrw ?? 0), 0) : null,
  };
}
