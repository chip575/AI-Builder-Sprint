// 인벤토리 집계 (FR-401 · FR-402)
//
// 라우트에서 떼어낸 순수 함수다 — 화면이 자체 계산하지 않게 서버가 주는 값이고,
// 저장소 두 구현 어디서 읽어도 같은 규칙으로 접히는지를 이 함수 하나로 검사한다.
import { debtNoticeStatutes } from "@/lib/rules/inheritance";
import {
  AssetCategory,
  InventoryRes,
  type Asset,
  type CategoryRollup,
  type InventorySummary,
} from "@/lib/contracts";
// 임계값을 새로 정하지 않는다 — 파이프라인이 이미 쓰는 값을 그대로 쓴다 (FR-102)
import { CONFIRM_THRESHOLD } from "@/lib/ai/extract/confidence";
import { store } from "@/lib/store";

/** 카테고리 표시 순서는 계약이 정한다 (AssetCategory 배열 순서) */
const ORDER = AssetCategory.options;

export function summarize(assets: Asset[]): InventorySummary {
  const byCategory: CategoryRollup[] = [];

  for (const category of ORDER) {
    const rows = assets.filter((a) => a.category === category);
    // 0건인 카테고리는 넣지 않는다 — "부동산 0건 0원"은 사실이 아니라 빈칸이다
    if (rows.length === 0) continue;
    // 금액 미상이 하나라도 섞이면 null이다. 부분 합계를 전체인 척 보여주면
    // 사용자는 "이게 내 재산의 전부"라고 읽는다 — 그 오해가 가장 비싸다
    const unknown = rows.some((a) => a.estimatedValueKrw == null);
    byCategory.push({
      category,
      count: rows.length,
      estimatedTotalKrw: unknown
        ? null
        : rows.reduce((sum, a) => sum + (a.estimatedValueKrw ?? 0), 0),
    });
  }

  const hasDebt = assets.some((a) => a.category === "DEBT");
  return {
    totalCount: assets.length,
    byCategory,
    // 확인 유도 대상 (P1) — 판독해 넣은 값은 사용자가 볼 때까지 미확인이다
    unconfirmedCount: assets.filter((a) => !a.confirmed).length,
    // 신뢰도가 없는 항목(수기 입력)은 낮은 게 아니라 해당 없음이다
    lowConfidenceCount: assets.filter(
      (a) => a.confidence != null && a.confidence < CONFIRM_THRESHOLD,
    ).length,
    hasDebt,
    // 채무가 있으면 상속 승인·포기 기간을 함께 알린다 (FR-402 · 민법 §1019).
    // 기간·조문만 싣고 **D-day는 계산하지 않는다** — 기산점("상속개시 있음을 안 날")을
    // 우리가 알 수 없기 때문이다. 수치는 lib/rules가 갖는다 (P3)
    debtNotice: hasDebt ? debtNoticeStatutes() : null,
  };
}

/** 인벤토리 응답 한 벌. 등록·조회가 같은 것을 돌려준다 —
 *  등록 응답이 화면 상태와 다르면 화면이 자체 계산을 시작한다 */
export async function buildInventory(userId: string): Promise<InventoryRes> {
  const [assets, beneficiaries] = await Promise.all([
    store.listAssets(userId),
    store.listBeneficiaries(userId),
  ]);
  return InventoryRes.parse({
    assets,
    beneficiaries,
    summary: summarize(assets),
    // 본인 조회는 필터가 걸리지 않았다는 뜻으로 null이다.
    // 지킴이의 부분 열람(NFR-713)은 이 값을 실제 범위로 채운다 — FR-405 몫
    scopeApplied: null,
  });
}
