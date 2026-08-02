// 자산 되짚기 문장 — **코드가 만들고 모델은 그대로 싣는다** (FR-401 · P3)
//
// 왜 모델에게 목록을 주지 않는가: 주면 더한다. 금액 미상이 섞여 있어도 더하고,
// 채무까지 자산에 더한다. summarize()가 estimatedTotalKrw를 null로 막아둔 바로 그
// 실수를 프롬프트 한 줄이 되살리고, 그 숫자가 약정서로 흘러간다.
//
// 그래서 객관성은 모델이 만들지 않는다. 코드가 문장으로 만들어 건네고 모델 몫은
// 말투뿐이다 — 회상 질문을 "그대로 여쭙는다"고 시키는 것과 같은 문법 (FR-301).
//
// ⚠ 프롬프트로 나가는 값은 **카테고리·건수·금액**뿐이다. 자산명·기관명·계좌는
//   넘기지 않는다 (보안 2조). InventorySummary가 이미 그만큼만 담고 있다.
import type { InventorySummary } from "../../contracts";
import { ownedRollup } from "../../estate/rollup";

/** 화면(/estate)의 표와 같은 말을 쓴다 — 대화와 화면이 다른 이름을 쓰면 같은 것인 줄 모른다 */
export const CATEGORY_LABEL: Record<string, string> = {
  REAL_ESTATE: "부동산",
  FINANCIAL: "금융",
  INSURANCE: "보험",
  SECURITIES: "증권",
  DEBT: "채무",
  BELONGINGS: "물건",
  DIGITAL: "디지털",
};

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 항상 붙는 한계 고지 — 이 문장이 없으면 위의 합계가 "전 재산"으로 읽힌다.
 *  우리가 아는 경로는 둘뿐이고(서류 판독·직접 입력), 그 밖은 알 길이 없다 */
const LIMIT_NOTE = "저희는 올려 주신 서류와 직접 적어 주신 내용까지만 알 수 있습니다.";

/**
 * 모델에게 건넬 재산 사실 문장.
 *
 * `null`을 받으면 `null`을 돌려준다 — **조회 실패와 0건은 다르다.** 못 읽었는데
 * "확인한 자산이 없습니다"라고 말하면 거짓이 된다 (보안 7조: 조용한 우회 금지).
 *
 * 0건일 때도 문장을 만든다. "등록된 자산이 없습니다"라고 쓰지 않는 이유는, 그게
 * "당신은 재산이 없다"로 읽히고 거짓이기 때문이다. 우리가 아는 경로는 둘뿐이라
 * (서류 판독·직접 입력) 참인 문장은 **"저희가 확인한 자산이 없다"** 뿐이다.
 */
export function assetReadback(summary: InventorySummary | null): string | null {
  if (summary == null) return null;

  if (summary.totalCount === 0) {
    // 한계 고지는 0건일 때도 **같은 문장**을 쓴다. 여기만 다르게 쓰면 "확인한 자산이
    // 없다"가 우리 앎의 한계가 아니라 사용자의 상태로 읽힌다
    return `저희가 확인한 자산이 없습니다. ${LIMIT_NOTE}`;
  }

  // 채무 분리·합계 규칙은 lib/estate/rollup이 갖는다 — 화면(AssetStatus)과 **같은 함수**다.
  // 각자 계산하면 사용자가 같은 재산에 대해 두 개의 합계를 듣게 된다
  const { owned, debt, total } = ownedRollup(summary);

  const lines: string[] = [];

  if (owned.length === 0) {
    lines.push("저희가 확인한 것은 채무뿐이고, 자산으로 등록된 것은 없습니다.");
  } else {
    const parts = owned.map((c) => {
      const label = CATEGORY_LABEL[c.category] ?? c.category;
      // 금액 미상이 섞인 카테고리는 금액을 말하지 않는다. 일부만 더한 값을 그
      // 카테고리의 값인 척 내놓으면 사용자는 그게 전부라고 읽는다
      return c.estimatedTotalKrw == null
        ? `${label} ${c.count}건(금액 미기재)`
        : `${label} ${c.count}건 ${won(c.estimatedTotalKrw)}`;
    });

    lines.push(
      `저희가 확인한 자산은 ${parts.join(", ")}입니다.` +
        (total != null
          ? ` 합하면 ${won(total)}입니다.`
          : " 금액을 적지 않으신 항목이 있어 합계는 말씀드리지 않습니다."),
    );
  }

  // 채무·미확정은 있을 때만. 없는 것을 "0건"이라 말하면 빈칸을 사실처럼 읽게 된다
  const aside: string[] = [];
  if (debt) {
    aside.push(
      debt.estimatedTotalKrw == null
        ? `채무가 ${debt.count}건 함께 등록되어 있습니다`
        : `채무가 ${debt.count}건 ${won(debt.estimatedTotalKrw)} 함께 등록되어 있습니다`,
    );
  }
  if (summary.unconfirmedCount > 0) {
    aside.push(`아직 확인하지 않으신 항목이 ${summary.unconfirmedCount}건 있습니다`);
  }
  if (aside.length > 0) lines.push(`${aside.join(", ")}.`);

  lines.push(LIMIT_NOTE);

  return lines.join(" ");
}
