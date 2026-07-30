// M-GATE-COUNTER 화면 (org/GateCounter · FR-509)
// 게이트가 무효 서명 시도를 몇 건 막았는가 + 판정 3분기 분포.
"use client";

import { useEffect, useState } from "react";
import type { GateStatsRes } from "@/lib/contracts";
import { Notice, Shell } from "../../_components/Shell";

const VERDICT_LABEL: Record<string, string> = {
  ESIGN_OK: "전자서명 가능",
  ESIGN_INVALID: "전자서명 무효 — 대체 경로 안내",
  NON_BINDING: "법적 구속력 없음 (의도된 문서)",
};

export default function GateCounterPage() {
  const [stats, setStats] = useState<GateStatsRes | null>(null);

  useEffect(() => {
    void (async () => {
      const body = await fetch("/api/admin/gate-stats").then((r) => r.json());
      if (body.ok) setStats(body.data);
    })();
  }, []);

  if (!stats) {
    return (
      <Shell title="유효성 게이트" fr={["FR-509"]}>
        <p className="text-stone-500">불러오는 중…</p>
      </Shell>
    );
  }

  return (
    <Shell title="유효성 게이트" fr={["FR-509"]}>
      <div className="space-y-5">
        <div className="rounded-xl border border-stone-300 bg-white p-5">
          <p className="text-sm text-stone-500">무효 서명 시도 차단</p>
          <p className="mt-1 text-4xl font-semibold">{stats.blockedTotal}건</p>
          <p className="mt-2 text-sm text-stone-600">
            전자서명으로 효력이 생기지 않는 문서에 서명을 시도한 건수입니다.
            서버가 막았습니다.
          </p>
        </div>

        {stats.byStatute.length > 0 && (
          <div className="rounded-xl border border-stone-300 bg-white p-4">
            <p className="text-sm text-stone-500">차단 근거 조문</p>
            <ul className="mt-2 space-y-1">
              {stats.byStatute.map((s) => (
                <li key={s.id} className="flex justify-between text-sm">
                  <span>{s.id}</span>
                  <span className="text-stone-500">{s.count}건</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {Object.keys(stats.byDocType).length > 0 && (
          <div className="rounded-xl border border-stone-300 bg-white p-4">
            <p className="text-sm text-stone-500">차단된 문서 유형</p>
            <ul className="mt-2 space-y-1">
              {Object.entries(stats.byDocType).map(([k, v]) => (
                <li key={k} className="flex justify-between text-sm">
                  <span>{k}</span>
                  <span className="text-stone-500">{v}건</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-stone-300 bg-white p-4">
          <p className="text-sm text-stone-500">
            전체 판정 분포 ({stats.totalEvaluations}건)
          </p>
          <ul className="mt-2 space-y-1">
            {Object.entries(stats.byVerdict).map(([k, v]) => (
              <li key={k} className="flex justify-between text-sm">
                <span>{VERDICT_LABEL[k] ?? k}</span>
                <span className="text-stone-500">{v}건</span>
              </li>
            ))}
          </ul>
        </div>

        <Notice>
          차단 건수는 <strong>서명을 시도했다가 막힌 경우</strong>만 셉니다. 법적
          구속력이 없도록 의도된 문서(마음의 편지 등)는 차단이 아니라 정상 경로이므로
          이 숫자에 포함되지 않습니다.
        </Notice>
      </div>
    </Shell>
  );
}
