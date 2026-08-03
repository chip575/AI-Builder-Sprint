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
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorNote, Notice, Shell } from "@/app/(ui)/_components/Shell";
import { RevokeCell } from "./RevokeCell";
import { SectionHeading } from "@/app/(ui)/_components/HelpTip";
import { DOC_LABEL as DOC_LABEL_MAP, docLabel } from "@/lib/docs/labels";
import { SECTION_PANEL, SECTION_STACK } from "@/app/(ui)/_components/section";

interface Row {
  draftId: string;
  /** 원장 subject — 이력·철회가 쓴다 (intent_ledger_nodes.subject_id → intents.id) */
  intentId: string;
  docType: string;
  status: string;
  createdAt: string;
  verdict: string;
  hasExternal: boolean;
}

/** 표시명 — 코드값을 그대로 보여주지 않는다 (NFR-705) */
// 표시명은 lib/docs/labels가 갖는다 — 서버(철회 통지서)도 같은 이름을 쓴다

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
  /** 외부 동기화는 화면당 1회 — 필터 변경마다 왕복하면 목록이 느려진다 */
  const syncedRef = useRef(false);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (docType) q.set("docType", docType);
    if (status) q.set("status", status);
    if (from) q.set("from", new Date(from).toISOString());

    // 화면에 들어올 때 한 번만 외부 상태를 당겨온다 — 필터를 바꿀 때마다 부르지 않는다
    if (!syncedRef.current) {
      syncedRef.current = true;
      q.set("refresh", "1");
    }
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
      headerBar={{

      }}
    >
      <div className={SECTION_STACK}>
        <p className="text-stone-500">
          남기신 서류를 시간 순서로 모아 보여 드립니다 — 서명한 것과 손으로 남긴 것이
          한 줄에 섭니다.
        </p>

        {/* 필터 — 서버가 거른다. 모르는 값은 서버가 무시하므로 목록이 통째로 비지 않는다 */}
        <section className={SECTION_PANEL}>
        <div className="flex flex-wrap gap-2">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="min-h-11 rounded-xl border border-stone-300 px-3 text-sm"
            aria-label="서류 종류"
          >
            <option value="">모든 종류</option>
            {Object.entries(DOC_LABEL_MAP).map(([v, label]) => (
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

        </section>

        <ErrorNote error={error} />

        <section className={SECTION_PANEL}>
        <SectionHeading
          title="남긴 서류"
          help={
            <>
              지금까지 만드신 서류를 시간 순서로 보여드립니다.
              <br />
              <strong>효력</strong> 칸이 중요합니다 — 같은 “서류”라도 전자서명으로 효력이
              생기는 것(기부·유산 약정), 전자서명으로는 효력이 없는 것(자필 유언),
              서명 없이 보관하는 것(마음 편지)이 다릅니다. 법이 정한 방식이 서류마다
              달라서, 저희가 그 판정을 화면에 그대로 적습니다.
              <br />
              <strong>쓰는 법</strong> — <strong>열기</strong>는 서명 전이면 이어 쓰는 화면으로, 끝났으면 증빙 화면으로 갑니다. <strong>이력</strong>은 그 뜻이 어떻게 바뀌어 왔는지를 보여 줍니다.
              <br />
              <strong>그만두기</strong>도 서류마다 부르는 말이 다릅니다 — 사인증여는 철회,
              정기후원은 해지입니다. 되돌아오는 것이 다르기 때문입니다.
            </>
          }
        />

        {rows === null ? (
          <p className="text-sm text-stone-500">불러오는 중…</p>
        ) : rows.length === 0 && !error ? (
          // 빈 것도 상태다. 말하지 않으면 화면이 고장 난 것과 구분되지 않는다
          <Notice>아직 남기신 서류가 없습니다. 대화로 정리하시면 여기에 쌓입니다.</Notice>
        ) : (
          /* 가로는 좁은 화면 때문에, 세로는 서류가 쌓이기 때문에 굴린다.
             **잘라내지 않는다** — 상위 몇 건만 그리면 사용자는 없어진 줄 안다 (P4).
             머리줄은 붙여 둔다: 굴리는 중에 어느 칸이 무엇인지 잃으면 표가 아니라 나열이 된다 */
          <div className="max-h-[26rem] overflow-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead className="sticky top-0 bg-stone-50">
                <tr className="border-b border-stone-300 text-left text-stone-500">
                  <th className="py-2 pr-3 font-normal">남긴 날</th>
                  <th className="py-2 pr-3 font-normal">서류</th>
                  <th className="py-2 pr-3 font-normal">상태</th>
                  <th className="py-2 pr-3 font-normal">효력</th>
                  <th className="py-2 pr-3 font-normal">보기</th>
                  <th className="py-2 font-normal">그만두기</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.draftId} className="border-b border-stone-200">
                    <td className="py-3 pr-3 text-stone-700">
                      {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="py-3 pr-3 text-stone-900">
                      {docLabel(r.docType)}
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
                        className="text-ink underline underline-offset-4"
                      >
                        열기
                      </Link>
                      {/* 이력 진입점 — 지금까지 /ledger 화면이 있는데 갈 길이 없었다.
                          subjectId가 필요해 곁칸(NavSidebar)에는 둘 수 없고, 이 줄에는
                          그 문서의 id가 있으니 여기가 자리다 */}
                      <Link
                        href={`/ledger/${r.intentId}`}
                        className="ml-3 text-stone-500 underline underline-offset-4"
                      >
                        이력
                      </Link>
                    </td>
                    {/* 그만두기 — 버튼 글자가 서류마다 다르다. 네 단어(취소·철회·해지·회수)를
                        한 말로 뭉개면 사용자가 자기가 무엇을 하는지 모른다 (lib/rules/revocation).
                        철회할 수 없는 서류는 버튼 대신 왜 그런지를 보여 준다 */}
                    <td className="py-3">
                      <RevokeCell row={r} onDone={() => void load()} />
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
        </section>
      </div>
    </Shell>
  );
}
