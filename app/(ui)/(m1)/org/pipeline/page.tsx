// M-OBSERVABILITY 화면 (org/PipelineStats · NFR-709)
// 6단계가 실제로 돌았고 얼마나 걸렸는지. CONVERSE는 첫 토큰까지 시간이다 (NFR-702).
"use client";

import { useEffect, useState } from "react";
import type { PipelineStatsRes } from "@/lib/contracts";
import { Notice, Shell } from "@/app/(ui)/_components/Shell";

const STAGE_LABEL: Record<string, string> = {
  CONVERSE: "1 · 대화",
  EXTRACT: "2 · 구조화",
  GATE: "3 · 검증(게이트)",
  DRAFT: "4 · 문서화",
  SIGN: "5 · 체결",
  CUSTODY: "6 · 보관·이행",
};

const ms = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("ko-KR")}ms`);

export default function PipelineStatsPage() {
  const [stats, setStats] = useState<PipelineStatsRes | null>(null);

  useEffect(() => {
    void (async () => {
      const body = await fetch("/api/admin/pipeline-stats").then((r) => r.json());
      if (body.ok) setStats(body.data);
    })();
  }, []);

  if (!stats) {
    return (
      <Shell title="파이프라인 지표" fr={["NFR-709"]}>
        <p className="text-stone-500">불러오는 중…</p>
      </Shell>
    );
  }

  const converse = stats.stages.find((s) => s.stage === "CONVERSE");

  return (
    <Shell title="파이프라인 지표" fr={["NFR-709", "NFR-702"]}>
      <div className="space-y-5">
        <div className="rounded-xl border border-stone-300 bg-white p-5">
          <p className="text-sm text-stone-500">첫 토큰까지 (p95)</p>
          <p className="mt-1 text-4xl font-semibold">{ms(converse?.p95Ms ?? null)}</p>
          <p className="mt-2 text-sm text-stone-600">
            대화 응답의 첫 글자가 나오기까지 걸린 시간입니다. 기준은 2초입니다.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-stone-300 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 text-stone-500">
              <tr>
                <th className="p-3 text-left font-normal">단계</th>
                <th className="p-3 text-right font-normal">성공</th>
                <th className="p-3 text-right font-normal">장애</th>
                <th className="p-3 text-right font-normal">p50</th>
                <th className="p-3 text-right font-normal">p95</th>
              </tr>
            </thead>
            <tbody>
              {stats.stages.map((s) => (
                <tr key={s.stage} className="border-b border-stone-100 last:border-0">
                  <td className="p-3">{STAGE_LABEL[s.stage] ?? s.stage}</td>
                  <td className="p-3 text-right">{s.success}</td>
                  <td
                    className={`p-3 text-right ${s.fail > 0 ? "text-rose-700" : "text-stone-400"}`}
                  >
                    {s.fail}
                  </td>
                  <td className="p-3 text-right text-stone-600">{ms(s.p50Ms)}</td>
                  <td className="p-3 text-right text-stone-600">{ms(s.p95Ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-sm text-stone-500">전체 기록 {stats.totalRecords}건</p>

        <Notice>
          대화 단계의 시간은 <strong>첫 토큰까지</strong>입니다. 전체 응답이 끝나는
          시간이 아니라, 사용자가 기다리기 시작해서 첫 글자를 보기까지의 시간입니다.
          기록이 없는 단계는 &ldquo;—&rdquo;로 표시됩니다 — 0ms와 다릅니다.
          <br />
          <strong>장애</strong>는 시스템 오류만 셉니다. 게이트 차단이나 확인 전 거부처럼
          <strong>의도된 정책 거부는 포함되지 않습니다</strong> — 그건 유효성 게이트 화면에서 봅니다.
        </Notice>
      </div>
    </Shell>
  );
}
