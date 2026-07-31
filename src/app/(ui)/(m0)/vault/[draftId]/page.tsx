// S7 · 증빙 (vault/EvidenceView · FR-505 · FR-115B)
// 축(마음 유언) 소개는 여기서 딱 한 번. 거절하면 다시 권하지 않는다 (FR-115B).
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { EvidenceRes } from "@/lib/contracts";
import { ErrorNote, Notice, Shell } from "@/app/(ui)/_components/Shell";

export default function VaultPage() {
  const draftId = String(useParams().draftId);
  const [evidence, setEvidence] = useState<EvidenceRes | null>(null);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);
  const [spineDismissed, setSpineDismissed] = useState(false);
  const [preparing, setPreparing] = useState(false);

  // 서명 완료 직후에는 증빙이 아직 만들어지는 중일 수 있다 —
  // 웹훅 처리(아웃박스)가 비동기이기 때문. 몇 초간 조용히 기다린다.
  useEffect(() => {
    let alive = true;
    void (async () => {
      for (let attempt = 0; attempt < 6 && alive; attempt++) {
        const body = await fetch(`/api/evidence/${draftId}`).then((r) => r.json());
        if (body.ok) {
          setEvidence(body.data);
          return;
        }
        if (body.error.code !== "NOT_FOUND") {
          setError(body.error);
          return;
        }
        setPreparing(true);
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (alive) {
        setPreparing(false);
        setError({
          message: "증빙을 준비하는 데 시간이 걸리고 있어요.",
          nextAction: "잠시 후 이 화면을 새로고침해 주세요.",
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [draftId]);

  return (
    <Shell title="증빙" fr={["FR-505", "FR-115B"]}>
      <div className="space-y-5">
        {preparing && !evidence && !error && (
          <p className="text-stone-500">서명이 완료됐어요. 증빙을 준비하는 중입니다…</p>
        )}

        <ErrorNote error={error} />

        {evidence && (
          <>
            <div className="rounded-xl border border-stone-300 bg-white p-4">
              <p className="text-2xl">서명이 완료됐습니다</p>
              <p className="mt-2 text-sm text-stone-500">서명 시각</p>
              <p>{new Date(evidence.signedAt).toLocaleString("ko-KR")}</p>

              <p className="mt-4 text-sm text-stone-500">참여자</p>
              <ul className="mt-1 space-y-1">
                {evidence.parties.map((p, i) => (
                  <li key={i} className="text-sm">
                    {p.name}
                    {p.signedAt ? " · 서명함" : ""}
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-sm text-stone-500">문서 해시 (SHA-256)</p>
              <p className="font-mono text-xs break-all text-stone-700">{evidence.hash}</p>
            </div>

            <a
              href={evidence.pdfUrl}
              className="block min-h-11 rounded-xl bg-stone-900 px-6 py-3 text-center text-stone-50"
            >
              증빙 PDF 내려받기
            </a>
            <Notice>
              내려받기 링크는 15분 뒤 만료됩니다. 만료되면 이 화면에서 다시 받으실 수 있어요.
            </Notice>
          </>
        )}

        {/* 축 소개 — 한 번만. 재촉하지 않는다 (FR-115B) */}
        {evidence && !spineDismissed && (
          <div className="rounded-xl border border-stone-300 bg-white p-4">
            <p className="leading-relaxed">
              오늘 남기신 마음을 이야기로도 정리해 볼 수 있어요. 언제 시작하셔도 되고,
              하지 않으셔도 괜찮습니다.
            </p>
            <div className="mt-3 flex gap-2">
              {/* 축 세션의 입구는 /recall이다. /chat으로 보내면 가지 대화로 돌아가
                  "이야기로 정리해 보자"는 제안과 도착지가 어긋난다 */}
              <Link
                href="/recall"
                className="min-h-11 flex-1 rounded-xl border border-stone-300 px-4 py-3 text-center text-sm"
              >
                이야기 시작하기
              </Link>
              <button
                onClick={() => setSpineDismissed(true)}
                className="min-h-11 flex-1 rounded-xl px-4 py-3 text-center text-sm text-stone-500"
              >
                괜찮아요
              </button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
