// S3 · 확인·편집 (confirm/FactSheet · FR-103 · FR-202 · FR-201)
// P1을 화면으로 강제하는 유일한 지점 — 이 화면의 "확인" 버튼을 누르지 않으면 서버가 문서 생성을 거부한다.
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { FactSheetRes } from "@/lib/contracts";
import { ErrorNote, Notice, PrimaryButton, Shell } from "@/app/(ui)/_components/Shell";
import { AssetPeek } from "@/app/(ui)/_components/AssetPeek";

const LABEL: Record<string, string> = {
  region: "기부하실 지역",
  amount: "기부 금액",
  orgName: "후원 대상",
};

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function FactSheet() {
  const router = useRouter();
  const intentId = useSearchParams().get("intentId");
  const [sheet, setSheet] = useState<FactSheetRes | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);

  // 마운트 시 조회 — extract 재호출이 아니다 (그건 UPSERT라 편집분을 덮는다)
  const load = useCallback(async () => {
    if (!intentId) return;
    const res = await fetch(`/api/facts?intentId=${intentId}`);
    const body = await res.json();
    if (body.ok) setSheet(body.data);
    else setError(body.error);
  }, [intentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(factId: string, raw: string, isNumber: boolean) {
    setBusy(true);
    setError(null);
    const value = isNumber ? Number(raw.replace(/[^0-9]/g, "")) : raw;
    const res = await fetch(`/api/facts/${factId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    const body = await res.json();
    setBusy(false);
    if (!body.ok) return setError(body.error);
    await load(); // 재계산·확정 무효가 반영된 최신 상태
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/facts/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId }),
    });
    const body = await res.json();
    setBusy(false);
    if (!body.ok) return setError(body.error);
    router.push(`/rewards?intentId=${intentId}`);
  }

  if (!intentId) return <p className="text-stone-500">대화를 먼저 시작해 주세요.</p>;
  if (!sheet) return <p className="text-stone-500">불러오는 중…</p>;

  return (
    <div className="space-y-5">
      <p className="text-stone-600">
        말씀하신 내용을 이렇게 정리했어요. 다르면 눌러서 고쳐 주세요.
      </p>

      <ul className="space-y-3">
        {sheet.facts.map((f) => {
          const isNumber = typeof f.value === "number";
          return (
            <li key={f.id} className="rounded-xl border border-stone-300 bg-white p-4">
              <label className="block text-sm text-stone-500" htmlFor={f.id}>
                {LABEL[f.key] ?? f.key}
                {f.confidence < 0.7 && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                    확인해 주세요
                  </span>
                )}
              </label>
              <input
                id={f.id}
                defaultValue={isNumber ? String(f.value) : String(f.value ?? "")}
                onBlur={(e) => void patch(f.id, e.target.value, isNumber)}
                className="mt-1 min-h-11 w-full rounded-lg border border-stone-200 px-3 py-2 text-lg outline-none focus:border-stone-500"
              />
              {f.sourceSpan && (
                <p className="mt-2 text-sm text-stone-500">
                  이렇게 말씀하셨어요 — “{f.sourceSpan.text}”
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {sheet.deduction && (
        <div className="rounded-xl border border-stone-300 bg-white p-4">
          <p className="text-sm text-stone-500">예상 세액공제</p>
          <p className="mt-1 text-2xl font-semibold">
            {won(sheet.deduction.deductionAmount)}
          </p>
          <p className="mt-2 text-sm text-stone-600">
            {sheet.deduction.breakdown
              .map((b) => `${b.label} ${won(b.deducted)}`)
              .join(" + ")}
          </p>
          <p className="mt-2 text-xs text-stone-500">
            근거 갱신일 {sheet.deduction.ruleVerifiedAt}
          </p>
        </div>
      )}

      {sheet.deduction && <Notice>{sheet.deduction.disclaimer}</Notice>}
      <Notice>
        주소는 자기 신고 기준입니다. 실제 기부 시 공식 채널에서 확인됩니다. 거주 중인
        지자체에는 기부할 수 없습니다.
      </Notice>

      <ErrorNote error={error} />

      {sheet.missingRequired.length > 0 && (
        <Notice>
          아직 정하지 않은 항목이 있어요:{" "}
          {sheet.missingRequired.map((k) => LABEL[k] ?? k).join(", ")}
        </Notice>
      )}

      {/* 버튼을 조용히 죽이지 않는다 — 회색 버튼만 남으면 무엇을 해야 하는지 알 수 없다.
          누르면 무엇이 모자란지, 어디로 가야 하는지 알려준다 (NFR-705) */}
      {/* 문서를 만들기 직전이다 — 무엇을 남길지 정하는 자리라 재산을 볼 수 있어야 한다.
          접혀 있고, 누른 사람에게만 보인다 (P4) */}
      <div className="mb-4">
        <AssetPeek label="내 자산 확인하기" />
      </div>

      <PrimaryButton
        onClick={() => {
          if (sheet.missingRequired.length > 0) {
            setError({
              message: `${sheet.missingRequired
                .map((k) => LABEL[k] ?? k)
                .join(", ")} 항목이 아직 비어 있어요.`,
              nextAction: "대화로 돌아가 그 내용을 말씀해 주시면 이어서 정리해 드릴게요.",
            });
            return;
          }
          void confirm();
        }}
        disabled={busy}
      >
        {sheet.confirmedAt ? "확인함 — 다음으로" : "이대로 확인했어요"}
      </PrimaryButton>

      {/* 나가는 문 — 이게 없으면 이 화면이 막다른 길이 된다.
          작성실로 보낸다: 여기로 오는 길이 /write이고, /chat은 입구가 없어져
          아무도 못 가는 화면을 가리키게 된다 (2026-08-02 개편) */}
      <button
        type="button"
        onClick={() => router.push("/write")}
        className="min-h-11 w-full text-sm text-stone-500 underline underline-offset-4"
      >
        ← 작성실로 돌아가기
      </button>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Shell title="정리된 내용 확인" fr={["FR-103", "FR-202", "FR-201"]}>
      <Suspense fallback={<p className="text-stone-500">불러오는 중…</p>}>
        <FactSheet />
      </Suspense>
    </Shell>
  );
}
