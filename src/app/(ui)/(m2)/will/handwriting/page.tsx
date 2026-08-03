// M-HANDWRITING 화면 (will/HandwritingGuide · FR-302 · 민법 §1066)
//
// ⚠ 이 화면에는 **서명 버튼이 없다.** 유언장은 전자서명으로 효력이 생기지 않는다.
//    게이트가 ESIGN_INVALID로 라우팅한 바로 그 목적지이고, 이 부재 자체가
//    "법이 인정하는 방식으로만"의 실물이다.
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { HandwritingGuideRes } from "@/lib/contracts";
import { ErrorNote, Notice, PrimaryButton, Shell } from "@/app/(ui)/_components/Shell";
import { BLANK_GUIDES, NOT_LEGAL_ADVICE } from "@/lib/rules/handwriting-guide";

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
  const intentId = useSearchParams().get("intentId");
  const [guide, setGuide] = useState<HandwritingGuideRes | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [printed, setPrinted] = useState(false);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);

  useEffect(() => {
    if (!intentId) return;
    void (async () => {
      const body = await fetch(`/api/will/draft/${intentId}/print`).then((r) => r.json());
      if (body.ok) setGuide(body.data);
      else setError(body.error);
    })();
  }, [intentId]);

  // intentId가 없으면 옮겨 적을 초안이 아직 없다는 뜻이다.
  // ⚠ 옛 문구는 "대화를 먼저 시작해 주세요"였는데, 그 대화(/chat)는 은퇴했고
  //   무엇을 하라는 것인지도 말해 주지 않아 사용자가 갈 곳이 없었다 (P4 · NFR-705).
  //   여기서는 왜 비었는지와 다음에 할 일을 함께 준다.
  if (!intentId) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 leading-relaxed text-amber-900">
          {NOTICE}
        </div>
        <p className="leading-relaxed text-stone-700">
          아직 옮겨 적을 내용이 없습니다. 작성실에서 무엇을 남기실지 이야기해 주시면,
          유언으로 남겨야 하는 부분이 나올 때 이 화면으로 안내해 드립니다.
        </p>
        <Link
          href="/write"
          className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
        >
          작성실로 가기
        </Link>
        <Notice>{NOT_LEGAL_ADVICE}</Notice>
      </section>
    );
  }
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
        <ul className="mt-3 space-y-1 rounded-lg bg-stone-100 p-4 text-sm text-stone-700 print:bg-white">
          {BLANK_GUIDES.map((b) => (
            <li key={b.label}>
              <strong>{b.label}</strong> 자리 — {b.how}
            </li>
          ))}
        </ul>

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

      {/* 이 화면의 완결점은 **인쇄**다 (FR-302). 원래 `/vault-will`로 보내고 있었는데
          그 경로는 manifest에도 코드에도 없어 404였다 — 화면이 지어낸 목적지였다.
          자필 유언의 보관 안내는 법률 내용이라 lib/rules에 근거가 생기기 전에는 만들지 않는다 */}
      <div className="print:hidden">
        <PrimaryButton
          disabled={!allChecked}
          onClick={() => {
            setPrinted(true);
            window.print();
          }}
        >
          {allChecked
            ? "네 가지 모두 확인했어요 — 인쇄하기"
            : `확인이 남았어요 (${checked.length}/${guide.checklist.length})`}
        </PrimaryButton>
        {/* 인쇄물을 그대로 유언장으로 오해하는 것이 이 화면의 가장 큰 위험이다.
            전문 자서(민법 §1066)가 요건이므로 인쇄물 자체는 유언이 아니다 */}
        {printed && (
          <Notice>
            인쇄한 초안을 보고 <strong>직접 손으로</strong> 옮겨 적으세요. 인쇄물 자체는
            유언으로서 효력이 없습니다.
          </Notice>
        )}
      </div>

      {/* NFR-706 — 화면·인쇄물 모두에 상시 노출한다 (print:hidden을 붙이지 않는다) */}
      <Notice>{NOT_LEGAL_ADVICE}</Notice>
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
