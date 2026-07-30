// 관리자 개요 — 견고성 3종 세트 (FR-504 · FR-509 · NFR-709)
// 게이트 차단 · 실행 지표 · 마지막 동기화/교정. 한 화면에서 "이 시스템이 살아 있다"를 보인다.
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { GateStatsRes, PipelineStatsRes } from "@/lib/contracts";
import { Notice, Shell } from "@/app/(ui)/_components/Shell";

interface ReconcileState {
  lastSyncAt: string | null;
  correctedTotal: number;
}

export default function OrgOverviewPage() {
  const [gate, setGate] = useState<GateStatsRes | null>(null);
  const [pipe, setPipe] = useState<PipelineStatsRes | null>(null);
  const [sync, setSync] = useState<ReconcileState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [g, p, s] = await Promise.all([
      fetch("/api/admin/gate-stats").then((r) => r.json()),
      fetch("/api/admin/pipeline-stats").then((r) => r.json()),
      fetch("/api/cron/reconcile").then((r) => r.json()),
    ]);
    if (g.ok) setGate(g.data);
    if (p.ok) setPipe(p.data);
    if (s.ok) setSync(s.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runReconcile() {
    setBusy(true);
    await fetch("/api/cron/reconcile?staleMs=0", { method: "POST" });
    setBusy(false);
    await load();
  }

  const converse = pipe?.stages.find((s) => s.stage === "CONVERSE");
  const faults = pipe?.stages.reduce((n, s) => n + s.fail, 0) ?? 0;

  return (
    <Shell title="운영 현황" fr={["FR-504", "FR-509", "NFR-709"]}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/org/gate-counter"
            className="rounded-xl border border-stone-300 bg-white p-4 transition hover:border-stone-500"
          >
            <p className="text-sm text-stone-500">무효 서명 차단</p>
            <p className="mt-1 text-3xl font-semibold">{gate?.blockedTotal ?? "—"}</p>
            <p className="mt-1 text-xs text-stone-500">유효성 게이트</p>
          </Link>

          <Link
            href="/org/pipeline"
            className="rounded-xl border border-stone-300 bg-white p-4 transition hover:border-stone-500"
          >
            <p className="text-sm text-stone-500">첫 토큰 p95</p>
            <p className="mt-1 text-3xl font-semibold">
              {converse?.p95Ms === null || converse === undefined
                ? "—"
                : `${converse.p95Ms}ms`}
            </p>
            <p className="mt-1 text-xs text-stone-500">장애 {faults}건</p>
          </Link>

          <div className="rounded-xl border border-stone-300 bg-white p-4">
            <p className="text-sm text-stone-500">마지막 동기화</p>
            <p className="mt-1 text-lg font-semibold">
              {sync?.lastSyncAt
                ? new Date(sync.lastSyncAt).toLocaleTimeString("ko-KR")
                : "—"}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              누적 교정 {sync?.correctedTotal ?? 0}건
            </p>
          </div>
        </div>

        <button
          onClick={() => void runReconcile()}
          disabled={busy}
          className="min-h-11 w-full rounded-xl border border-dashed border-stone-400 px-6 py-3 text-sm text-stone-600 disabled:opacity-50"
        >
          {busy ? "대조 중…" : "지금 외부와 대조하기 (리컨실러 실행)"}
        </button>

        <Notice>
          웹훅이 도달하지 않아도 리컨실러가 외부 상태를 대조해 교정합니다. 위 버튼은
          그 과정을 즉시 실행합니다 — 웹훅을 끊어도 상태가 따라잡히는 것을 확인할 수
          있습니다.
        </Notice>
      </div>
    </Shell>
  );
}
