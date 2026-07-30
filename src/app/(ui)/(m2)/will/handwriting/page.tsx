// M-HANDWRITING 화면 (will/HandwritingGuide · FR-302 · 민법 §1066)
//
// ⚠ 이 화면에는 **서명 버튼이 없다.** 유언장은 전자서명으로 효력이 생기지 않는다.
//    게이트가 ESIGN_INVALID로 라우팅한 바로 그 목적지이고, 이 부재 자체가
//    "법이 인정하는 방식으로만"의 실물이다.
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { HandwritingGuideRes } from "@/lib/contracts";
import { ErrorNote, Notice, PrimaryButton, Shell } from "@/app/(ui)/_components/Shell";

const NOTICE =
  "이 문서는 손으로 옮겨 적어야 효력이 있습니다. 인쇄물에 서명하거나 전자서명을 해도 유언으로서 효력이 생기지 않습니다 (민법 제1066조).";

const NOTARIAL = {
  title: "공정증서 유언(공증)이라는 방법도 있습니다",
  pros: [
    "공증인이 방식을 확인하므로 형식 흠결로 무효가 될 위험이 낮습니다",
    "원본을 공증사무소가 보관해 분실·훼손 위험이 적습니다",
  ],
  cons: ["증인 2명이 필요하고 비용이 듭니다", "공증사무소를 직접 방문해야 합니다"],
};

function HandwritingGuide() {
  const router = useRouter();
  const intentId = useSearchParams().get("intentId");
  const [guide, setGuide] = useState<HandwritingGuideRes | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);

  useEffect(() => {
    if (!intentId) return;
    void (async () => {
      const body = await fetch(`/api/will/draft/${intentId}/print`).then((r) => r.json());
      if (body.ok) setGuide(body.data);
      else setError(body.error);
    })();
  }, [intentId]);

  if (!intentId) return <p className="text-stone-500">대화를 먼저 시작해 주세요.</p>;
  if (error) return <ErrorNote error={error} />;
  if (!guide) return <p className="text-stone-500">불러오는 중…</p>;

  // 하나씩 순차 확인 — 한 번에 전체 체크할 수 없다 (FR-302)
  const nextIndex = checked.length;
  const allChecked = checked.length === guide.checklist.length;

  return (
    <div className="space-y-6">
      {/* 최상단 고정 문구 — 화면·인쇄물 모두 (FR-302 수락 기준) */}
      <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-base leading-relaxed text-amber-900 print:border-black print:bg-white print:text-black">
        {NOTICE}
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">옮겨 적으실 내용</h2>
        <p className="mb-3 text-sm text-stone-500">
          아래 글을 <strong>처음부터 끝까지 손으로</strong> 옮겨 적어 주세요. 빈칸은
          직접 채우셔야 효력이 생깁니다.
        </p>
        {/* 큰 글씨·고대비 + 인쇄 가능 (FR-302 · NFR-701) */}
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-stone-400 bg-white p-6 text-xl leading-loose text-stone-900 print:border-black print:text-lg">
          {guide.draftText}
        </pre>
        <button
          onClick={() => window.print()}
          className="mt-3 min-h-11 w-full rounded-xl border border-stone-400 px-6 py-3 text-stone-700 print:hidden"
        >
          인쇄하기
        </button>
      </section>

      <section className="print:hidden">
        <h2 className="mb-2 text-lg font-semibold">다 쓰신 뒤 하나씩 확인해 주세요</h2>
        <p className="mb-3 text-sm text-stone-500">
          네 가지 중 하나라도 빠지면 유언장 전체가 무효가 됩니다. 순서대로 확인해
          주세요.
        </p>
        <ol className="space-y-3">
          {guide.checklist.map((item, i) => {
            const isChecked = checked.includes(item.id);
            const isNext = i === nextIndex;
            const locked = !isChecked && !isNext;
            return (
              <li
                key={item.id}
                className={`rounded-xl border p-4 ${
                  isChecked
                    ? "border-emerald-300 bg-emerald-50"
                    : locked
                      ? "border-stone-200 bg-stone-100 opacity-60"
                      : "border-stone-400 bg-white"
                }`}
              >
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={locked}
                    onChange={(e) =>
                      setChecked((prev) =>
                        e.target.checked
                          ? [...prev, item.id]
                          : prev.filter((x) => x !== item.id),
                      )
                    }
                    className="mt-1 h-5 w-5"
                  />
                  <span>
                    <span className="block font-medium">
                      {i + 1}. {item.label}
                    </span>
                    <span className="mt-1 block text-sm text-stone-600">
                      {item.caseNote}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-xl border border-stone-300 bg-white p-4 print:hidden">
        <p className="font-medium">{NOTARIAL.title}</p>
        <p className="mt-2 text-sm text-stone-500">좋은 점</p>
        <ul className="list-inside list-disc text-sm text-stone-700">
          {NOTARIAL.pros.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-stone-500">부담이 되는 점</p>
        <ul className="list-inside list-disc text-sm text-stone-700">
          {NOTARIAL.cons.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      <section className="print:hidden">
        <p className="text-sm text-stone-500">근거 법령·판례</p>
        <ul className="mt-1 space-y-1">
          {guide.statutes.map((s) => (
            <li key={s.id} className="text-sm text-stone-700">
              <strong>{s.id}</strong> — {s.summary}
            </li>
          ))}
        </ul>
      </section>

      <div className="print:hidden">
        <PrimaryButton
          disabled={!allChecked}
          onClick={() => router.push(`/vault-will?intentId=${intentId}`)}
        >
          {allChecked
            ? "네 가지 모두 확인했어요 — 보관 안내로"
            : `확인이 남았어요 (${checked.length}/${guide.checklist.length})`}
        </PrimaryButton>
      </div>

      <Notice>
        이 안내는 법률 자문이 아닙니다. 재산 규모가 크거나 상속인 사이에 다툼이
        예상되면 전문가와 상의해 주세요.
      </Notice>
    </div>
  );
}

export default function HandwritingPage() {
  return (
    <Shell title="자필 유언 옮겨 쓰기" fr={["FR-302"]}>
      <Suspense fallback={<p className="text-stone-500">불러오는 중…</p>}>
        <HandwritingGuide />
      </Suspense>
    </Shell>
  );
}
