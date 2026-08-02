// S4 · 답례품 선택 (branch/RewardPicker · FR-203)
// 한도 초과는 경고가 아니라 선택 불가다. 최종 판정은 서버가 한다 —
// 화면의 비활성화는 UX일 뿐이고, 조작된 요청은 POST rewards/select가 422로 거부한다.
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { Reward } from "@/lib/contracts";
import { ErrorNote, Notice, PrimaryButton, Shell } from "@/app/(ui)/_components/Shell";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function RewardPicker() {
  const router = useRouter();
  const intentId = useSearchParams().get("intentId");
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [amount, setAmount] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);

  // 한도는 서버가 계산한다 (P3) — 빈 선택으로 물으면 remaining이 곧 한도다
  const askLimit = useCallback(async (donation: number) => {
    const res = await fetch("/api/rewards/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rewardIds: [], amount: donation }),
    });
    const body = await res.json();
    if (body.ok) setLimit(body.data.remaining);
  }, []);

  useEffect(() => {
    void (async () => {
      const [list, sheet] = await Promise.all([
        fetch("/api/rewards").then((r) => r.json()),
        fetch(`/api/facts?intentId=${intentId}`).then((r) => r.json()),
      ]);
      if (list.ok) setRewards(list.data);
      const donation = sheet.ok
        ? sheet.data.facts.find((f: { key: string }) => f.key === "amount")?.value
        : null;
      if (typeof donation === "number") {
        setAmount(donation);
        await askLimit(donation);
      }
    })();
  }, [intentId, askLimit]);

  const total = rewards
    .filter((r) => picked.includes(r.id))
    .reduce((sum, r) => sum + r.price, 0);
  const remaining = limit === null ? null : limit - total;

  function toggle(r: Reward) {
    setError(null);
    setPicked((p) =>
      p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id],
    );
  }

  async function next() {
    setBusy(true);
    setError(null);
    // 선택 0건도 유효한 완료 — 기부는 답례품이 목적이 아니다
    const res = await fetch("/api/rewards/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rewardIds: picked, amount }),
    });
    const body = await res.json();
    setBusy(false);
    if (!body.ok) return setError(body.error);

    const draft = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId }),
    }).then((r) => r.json());
    if (!draft.ok) return setError(draft.error);
    router.push(`/doc/${draft.data.draftId}`);
  }

  return (
    <div className="space-y-5">
      <p className="text-stone-600">
        {amount ? `${won(amount)} 기부에 대한 답례품이에요. ` : ""}
        받지 않으셔도 괜찮습니다.
      </p>

      {remaining !== null && (
        <div className="rounded-xl border border-stone-300 bg-white p-4">
          <p className="text-sm text-stone-500">남은 선택 가능 금액</p>
          <p className="mt-1 text-2xl font-semibold">{won(Math.max(remaining, 0))}</p>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3">
        {rewards.map((r) => {
          const isPicked = picked.includes(r.id);
          // 한도 초과 조합은 선택 자체가 불가 (FR-203) — 경고가 아니다
          const wouldExceed =
            !isPicked && remaining !== null && r.price > remaining;
          return (
            <li key={r.id}>
              <button
                onClick={() => toggle(r)}
                disabled={wouldExceed}
                className={`min-h-11 w-full rounded-xl border p-4 text-left transition ${
                  isPicked
                    ? "border-ink bg-ink text-stone-50"
                    : wouldExceed
                      ? "cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400"
                      : "border-stone-300 bg-white hover:border-stone-500"
                }`}
              >
                <span className="block">{r.name}</span>
                <span className="mt-1 block text-sm opacity-80">{won(r.price)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <Notice>
        답례품은 법이 정한 한도 안에서만 선택할 수 있습니다. 현금·귀금속·유가증권은
        답례품이 될 수 없어 목록에 없습니다.
      </Notice>

      <ErrorNote error={error} />

      <PrimaryButton onClick={() => void next()} disabled={busy || !amount}>
        {picked.length === 0 ? "답례품 없이 진행할게요" : "이대로 약정서 만들기"}
      </PrimaryButton>
    </div>
  );
}

export default function RewardsPage() {
  return (
    <Shell title="답례품 선택" fr={["FR-203"]}>
      <Suspense fallback={<p className="text-stone-500">불러오는 중…</p>}>
        <RewardPicker />
      </Suspense>
    </Shell>
  );
}
