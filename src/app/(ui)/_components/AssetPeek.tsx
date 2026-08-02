// 자산 현황 엿보기 — 서류를 쓰는 중에 **자기 재산을 확인할 수 있게** (FR-401)
//
// ⚠ 소유: 화면은 FE 경로다. BE-2가 사람 승인 하에 **새 파일로만** 추가 — 병합 전 FE 리뷰.
//
// 왜 필요한가: 유산이나 기부를 정리하는 중에 "내가 뭘 가지고 있더라"를 확인할 곳이
// 없었다. 확인하려면 /estate로 나가야 했고, 나가면 쓰던 내용이 사라졌다.
//
// ⚠ **접어 둔다.** 펴 두면 화면을 열 때마다 총액이 먼저 눈에 들어오고, 기부 화면에서
//   그건 금액 제안이 된다 (system-prompt의 assetSection이 막으려는 것과 같은 이유).
//   누른 사람에게만 보이는 편이 P4(재촉하지 않는다)와도 맞는다.
// ⚠ 계산하지 않는다. 서버가 준 summary를 AssetStatus가 그대로 그린다 — 화면이 자체
//   계산을 시작하면 대화가 말하는 값과 갈라진다.
"use client";

import { useState } from "react";
import type { InventorySummary } from "@/lib/contracts";
import { AssetStatus } from "@/app/(ui)/(m4)/estate/AssetStatus";

export function AssetPeek({ label = "내 자산 확인하기" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [state, setState] = useState<"IDLE" | "LOADING" | "FAILED">("IDLE");

  async function toggle() {
    const next = !open;
    setOpen(next);
    // 열 때만 부른다 — 안 여는 사람에게 조회 왕복을 물리지 않는다
    if (!next || summary) return;
    setState("LOADING");
    const body = await fetch("/api/estate/assets")
      .then((r) => r.json())
      .catch(() => null);
    if (body?.ok) {
      setSummary(body.data.summary ?? null);
      setState("IDLE");
    } else {
      // 조회 실패를 "자산 없음"으로 바꾸지 않는다 — 없다고 말하면 거짓이 된다
      setState("FAILED");
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        aria-controls="asset-peek"
        className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-700 transition hover:bg-stone-100"
      >
        {label}
      </button>

      {/* 닫혀 있어도 DOM에 남긴다 — 버튼의 aria-controls가 가리킬 대상이 있어야 한다 */}
      <div id="asset-peek" hidden={!open}>
        {state === "LOADING" && <p className="text-sm text-stone-500">불러오는 중…</p>}
        {state === "FAILED" && (
          <p className="text-sm text-stone-500">
            지금은 자산 현황을 불러오지 못했습니다. 잠시 뒤 다시 열어 봐 주세요.
          </p>
        )}
        {state === "IDLE" && summary && <AssetStatus summary={summary} />}
      </div>
    </div>
  );
}
