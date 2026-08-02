// S-CLM · 서류 이력 — 시간축으로 모아 보는 화면 (FR-508 · FR-556)
//
// 배치·색·간격은 FE가 정한다. 여기서 고정하는 것은 **무엇이 보여야 하는가**뿐이다:
//  · 축은 시간이다. 모두싸인에 없는 문서(자필유언·마음 편지)도 같은 줄에 선다 —
//    외부를 축으로 잡으면 이 서비스의 핵심이 목록에서 사라진다
//  · 왜 서명이 없는지가 보여야 한다 (게이트 판정)
//  · 빈 목록도 말한다 — 아무 말이 없으면 "데이터가 없는 것"과 "화면이 안 부른 것"을
//    구분할 수 없다 (갱신 도래에서 실제로 겪었다)
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorNote, Notice, Shell } from "@/app/(ui)/_components/Shell";

interface Row {
  draftId: string;
  docType: string;
  status: string;
  createdAt: string;
  verdict: string;
  hasExternal: boolean;
}

/** 표시명 — 코드값을 그대로 보여주지 않는다 (NFR-705) */
const DOC_LABEL: Record<string, string> = {
  DONATION_PLEDGE: "기부 약정서",
  RECURRING_CONSENT: "정기후원 약정서",
  PRIVACY_TAX_CONSENT: "개인정보 동의서",
  VOLUNTEER_PLEDGE: "봉사 약정서",
  HERITAGE_SUPPORT_PLEDGE: "문화유산 후원 약정서",
  LEGACY_GIFT_AGREEMENT: "유산 기부 약정서",
  CUSTODIAN_AGREEMENT: "보관·집행 협조 약정서",
  INTENT_AFFIRMATION: "의사 확인서",
  HANDWRITTEN_WILL: "자필 유언",
  HEART_LETTER: "마음 편지",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "초안",
  REQUESTED: "서명 대기",
  COMPLETED: "완료",
  REJECTED: "거절됨",
  CANCELED: "취소됨",
};

const VERDICT_NOTE: Record<string, string> = {
  ESIGN_OK: "전자서명으로 효력",
  ESIGN_INVALID: "전자서명으로는 효력 없음",
  NON_BINDING: "서명 없이 보관",
};

export default function ClmPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);
  const [docType, setDocType] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (docType) q.set("docType", docType);
    if (status) q.set("status", status);
    if (from) q.set("from", new Date(from).toISOString());

    const res = await fetch(`/api/clm/documents?${q}`);
    const body = await res.json();
    if (!body.ok) {
      setRows([]);
      return setError(body.error);
    }
    setError(null);
    setRows(body.data.documents);
  }, [docType, status, from]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Shell
      title="서류 이력"
      fr={["FR-508", "FR-556"]}
      back={{ href: "/estate", label: "내 유산으로" }}
    >
      <div className="space-y-5">
        <p className="text-stone-600">남기신 서류를 시간 순서로 모아 보여 드립니다.</p>

        {/* 필터 — 서버가 거른다. 모르는 값은 서버가 무시하므로 목록이 통째로 비지 않는다 */}
        <div className="flex flex-wrap gap-2">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="min-h-11 rounded-xl border border-stone-300 px-3 text-sm"
            aria-label="서류 종류"
          >
            <option value="">모든 종류</option>
            {Object.entries(DOC_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="min-h-11 rounded-xl border border-stone-300 px-3 text-sm"
            aria-label="상태"
          >
            <option value="">모든 상태</option>
            {Object.entries(STATUS_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="min-h-11 rounded-xl border border-stone-300 px-3 text-sm"
            aria-label="이 날짜 이후"
          />
        </div>

        <ErrorNote error={error} />

        {rows === null ? (
          <p className="text-sm text-stone-400">불러오는 중…</p>
        ) : rows.length === 0 && !error ? (
          // 빈 것도 상태다. 말하지 않으면 화면이 고장 난 것과 구분되지 않는다
          <Notice>아직 남기신 서류가 없습니다. 대화로 정리하시면 여기에 쌓입니다.</Notice>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500">
                  <th className="py-2 pr-3 font-normal">남긴 날</th>
                  <th className="py-2 pr-3 font-normal">서류</th>
                  <th className="py-2 pr-3 font-normal">상태</th>
                  <th className="py-2 pr-3 font-normal">효력</th>
                  <th className="py-2 font-normal">보기</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.draftId} className="border-b border-stone-200">
                    <td className="py-3 pr-3 text-stone-700">
                      {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="py-3 pr-3 text-stone-900">
                      {DOC_LABEL[r.docType] ?? r.docType}
                    </td>
                    <td className="py-3 pr-3 text-stone-700">
                      {STATUS_LABEL[r.status] ?? r.status}
                    </td>
                    <td className="py-3 pr-3 text-stone-500">
                      {VERDICT_NOTE[r.verdict] ?? r.verdict}
                    </td>
                    <td className="py-3">
                      {/* 원본은 링크를 미리 발급하지 않는다 — 누를 때 신원을 확인하고
                          그때 연다 (보안 3조). 완료본은 증빙 화면이 그 문을 맡는다 */}
                      <Link
                        href={r.status === "COMPLETED" ? `/vault/${r.draftId}` : `/doc/${r.draftId}`}
                        className="underline underline-offset-4"
                      >
                        열기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows !== null && rows.length > 0 && (
          <p className="text-sm text-stone-500">{rows.length}건</p>
        )}
      </div>
    </Shell>
  );
}
