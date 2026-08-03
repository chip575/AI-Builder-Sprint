// S-ESTATE · 자산 등록 현황 (FR-401 · FR-402)
//
// ⚠ 소유: 화면은 FE 경로다. BE-2가 사람 승인 하에 **새 파일로만** 추가 — 병합 전 FE 리뷰.
//
// 왜 필요한가: 서버가 `summary`를 이미 내려주고 있었는데 화면이 `assets`만 꺼내 썼다.
// 그래서 사용자는 자기 자산이 **몇 건인지·얼마인지·확인이 끝났는지**를 볼 곳이 없었고,
// 대화에서 "지금 재산이 얼마인데"라고 물어야 했다. 갱신 도래 때와 같은 계열이다 —
// API에는 있는데 화면이 안 부르는 것.
//
// ⚠ 여기서 **아무것도 계산하지 않는다.** 합계·미확정 수는 서버(inventory.summarize)가
//   정한다. 화면이 자체 계산을 시작하면 대화가 말하는 값과 화면이 보여주는 값이 갈라진다.
//   특히 `estimatedTotalKrw === null`은 "0원"이 아니라 **"낼 수 없음"** 이다.
"use client";

import type { InventorySummary } from "@/lib/contracts";
import { ownedRollup } from "@/lib/estate/rollup";

const CATEGORY_LABEL: Record<string, string> = {
  REAL_ESTATE: "부동산",
  FINANCIAL: "금융",
  INSURANCE: "보험",
  SECURITIES: "증권",
  DEBT: "채무",
  BELONGINGS: "물건",
  DIGITAL: "디지털",
};

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function AssetStatus({
  summary,
  onConfirm,
}: {
  summary: InventorySummary;
  /** 있으면 "어디서 확인하나"를 안내한다. 없으면 그 문장을 내지 않는다 —
   *  갈 곳 없는 안내는 사용자를 헤매게 한다 */
  onConfirm?: boolean;
}) {
  // 채무 분리·합계 규칙은 lib/estate/rollup이 갖는다 — 대화(asset-readback)와 **같은 함수**다.
  // 화면이 따로 세면 사용자가 같은 재산에 대해 두 개의 합계를 보게 된다
  const { owned, debt, ownedCount, total } = ownedRollup(summary);

  if (summary.totalCount === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="text-stone-800">저희가 확인한 자산이 없습니다.</p>
        {/* "등록된 자산이 없습니다"라고 쓰지 않는다 — 그건 "당신은 재산이 없다"로
            읽히고 거짓이다. 우리가 아는 경로는 둘뿐이라 참인 문장은 이것뿐이다 */}
        <p className="mt-1 text-sm text-stone-500">
          저희는 올려 주신 서류와 직접 적어 주신 내용까지만 알 수 있습니다. 아래에서 하나씩
          적어 두시거나, 종이 문서를 찍어 올리시면 읽어 드립니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
      <div>
        <p className="text-sm text-stone-500">저희가 확인한 자산</p>
        <p className="mt-1 text-stone-900">
          <span className="font-serif text-2xl">{ownedCount}</span>건
          {total != null ? (
            <span className="ml-2 text-stone-700">· 합하면 {won(total)}</span>
          ) : null}
        </p>
        {total == null && ownedCount > 0 && (
          // 부분 합계를 전체인 척 보여주면 사용자는 "이게 내 재산의 전부"라고 읽는다.
          // 그 오해가 가장 비싸서, 숫자 대신 이 문장이 자리를 지킨다
          <p className="mt-1 text-sm text-stone-500">
            금액을 적지 않으신 항목이 있어 합계는 내지 않았습니다.
          </p>
        )}
      </div>

      {/* 카테고리별 — 막대는 **건수 비율**이다. 금액 비율이 아니다:
          금액 미상이 섞이면 금액 막대는 그릴 수가 없고, 억지로 그리면 거짓이 된다 */}
      <ul className="space-y-2">
        {owned.map((c) => (
          <li key={c.category}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-stone-700">{CATEGORY_LABEL[c.category] ?? c.category}</span>
              <span className="text-stone-500">
                {c.count}건
                {c.estimatedTotalKrw != null ? ` · ${won(c.estimatedTotalKrw)}` : " · 금액 미기재"}
              </span>
            </div>
            <div
              className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100"
              role="img"
              aria-label={`${CATEGORY_LABEL[c.category] ?? c.category} ${c.count}건, 전체 ${ownedCount}건 중`}
            >
              <div
                className="h-full rounded-full bg-stone-400"
                style={{ width: `${Math.round((c.count / ownedCount) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      {/* 확인 유도 (P1) — 판독해 넣은 값은 사용자가 볼 때까지 미확인이다.
          0건이면 이 줄을 아예 그리지 않는다: "미확인 0건"은 사실이 아니라 빈칸이다 */}
      {summary.unconfirmedCount > 0 && (
        <div className="rounded-lg bg-stone-50 px-3 py-2">
          <p className="text-sm text-stone-700">
            아직 확인하지 않으신 항목이 {summary.unconfirmedCount}건 있습니다. 내용을 살펴보고
            맞으면 확인해 주세요.
          </p>
          {/* 말만 하고 누를 곳이 없으면 안 된다 — 확인은 사용자의 행위이지
              우리가 대신 할 수 있는 일이 아니다 (P1). 목록에서 한 건씩 누른다 */}
          {onConfirm && (
            <p className="mt-1 text-sm text-stone-500">
              아래 자산 목록에서 항목마다 확인하실 수 있습니다.
            </p>
          )}
        </div>
      )}

      {debt && (
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
          <p className="text-sm text-stone-700">
            채무 {debt.count}건
            {debt.estimatedTotalKrw != null ? ` · ${won(debt.estimatedTotalKrw)}` : " · 금액 미기재"}
          </p>
          {/* 상속 승인·포기 안내 (FR-402). 서버가 lib/rules에서 채워 보낸 조문을
              **그대로** 싣는다 — 화면이 기간을 계산하지 않는다 (P3).
              D-day도 없다: 기산점("상속개시 있음을 안 날")을 우리가 알 수 없다 */}
          {summary.debtNotice?.map((s) => (
            <p key={s.id} className="mt-2 text-sm text-stone-600">
              <span className="text-stone-800">{s.id}</span> {s.title} — {s.summary}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
