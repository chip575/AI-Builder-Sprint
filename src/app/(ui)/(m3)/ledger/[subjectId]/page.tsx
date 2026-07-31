// S-LEDGER · 유족 타임라인 (FR-555 · FR-556)
//
// 이 화면이 답하는 질문은 하나다 — **"지금 유효한 뜻은 무엇이고, 이 이력은 온전한가."**
// 유언장 한 장은 "언제 무슨 이유로 바뀌었는가"를 말하지 못한다. 그 공백이
// 사후 분쟁의 자리다. 여기서는 변경마다 사유가 함께 남고, 해시 체인이
// 그 기록이 나중에 손대지지 않았음을 보인다.
"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { ErrorNote, Notice, Shell } from "@/app/(ui)/_components/Shell";
import type { FamilyAckRes, LedgerNode, LedgerRes } from "@/lib/contracts";

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "지금의 뜻", cls: "border-stone-800 bg-stone-800 text-white" },
  SUPERSEDED: { label: "지나간 뜻", cls: "border-stone-300 bg-white text-stone-500" },
  REVOKED: { label: "철회됨", cls: "border-stone-300 bg-stone-100 text-stone-400" },
};

const MATERIALITY_LABEL: Record<string, string> = {
  MATERIAL: "실질 변경",
  MINOR: "문구 변경",
  ANNOTATION: "기록",
};

export default function LedgerPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = use(params);
  const [data, setData] = useState<LedgerRes | null>(null);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);
  /** 노드별 가족 인지 현황 (FR-554). 없으면 표시하지 않는다 — 알리지 않은 것도 정상이다 */
  const [acks, setAcks] = useState<Record<string, FamilyAckRes>>({});

  useEffect(() => {
    let alive = true;
    fetch(`/api/ledger/${subjectId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!alive) return;
        if (!body.ok) {
          setError(body.error);
          return;
        }
        const ledger = body.data as LedgerRes;
        setData(ledger);
        // 인지 현황은 노드마다 따로 묻는다. 실패해도 이력 화면은 그대로 뜬다 —
        // 부가 정보가 본 화면을 죽이지 않는다
        for (const n of ledger.nodes) {
          fetch(`/api/family-ack?ledgerNodeId=${n.id}`)
            .then((r) => r.json())
            .then((b) => {
              if (alive && b.ok) setAcks((prev) => ({ ...prev, [n.id]: b.data }));
            })
            .catch(() => {});
        }
      })
      .catch(() =>
        setError({
          message: "이력을 불러오지 못했습니다.",
          nextAction: "잠시 후 다시 시도해 주세요.",
        }),
      );
    return () => {
      alive = false;
    };
  }, [subjectId]);

  return (
    <Shell title="뜻의 이력" fr={["FR-555", "FR-556"]}>
      {data && (
        // 검증 배지가 이 화면의 결론이다. 이력이 있다는 사실보다
        // 그 이력이 손대지지 않았다는 사실이 유족에게 필요한 정보다.
        <p
          className={
            "mb-6 rounded-xl border px-4 py-3 text-sm " +
            (data.chainValid
              ? "border-stone-200 bg-stone-50 text-stone-600"
              : "border-red-300 bg-red-50 font-medium text-red-700")
          }
        >
          {data.chainValid
            ? "이 이력은 기록된 뒤 변경되지 않았습니다. (해시 체인 검증 통과)"
            : "이력이 변조되었습니다. 기록된 내용과 검증값이 일치하지 않습니다."}
        </p>
      )}

      {data && (
        <ol className="space-y-4">
          {[...data.nodes].reverse().map((node: LedgerNode) => {
            const style = STATUS_STYLE[node.status] ?? STATUS_STYLE.SUPERSEDED!;
            return (
              <li
                key={node.id}
                className={
                  "rounded-xl border p-4 " +
                  (node.status === "ACTIVE" ? "border-stone-800" : "border-stone-200")
                }
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={"rounded-full border px-2 py-0.5 text-xs " + style.cls}>
                    {style.label}
                  </span>
                  <span className="text-xs text-stone-500">
                    {MATERIALITY_LABEL[node.materiality] ?? node.materiality}
                  </span>
                  <span className="ml-auto text-xs text-stone-400">
                    {new Date(node.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </div>

                {/* 변경 사유가 이 화면의 본문이다 — 무엇이 바뀌었는지보다 왜 바꿨는지가
                    사후에 다투어지는 지점이다 (FR-553) */}
                <p className="text-stone-900">{node.changeReason}</p>

                {node.conditionNote && (
                  <p className="mt-2 text-sm text-stone-500">{node.conditionNote}</p>
                )}
                {/* 인지 현황 — "동의를 받았다"가 아니라 "알렸고 확인했다"는 기록이다 */}
                {acks[node.id] && acks[node.id]!.requested > 0 && (
                  <p className="mt-2 text-sm text-stone-500">
                    가족 인지{" "}
                    {(() => {
                      const a = acks[node.id]!.acks;
                      const done = a.filter((x) => x.status === "ACKNOWLEDGED").length;
                      const declined = a.filter((x) => x.status === "DECLINED").length;
                      const pending = a.length - done - declined;
                      return [
                        done > 0 ? `확인 ${done}` : null,
                        pending > 0 ? `대기 ${pending}` : null,
                        // 거부는 숨기지 않는다. 다만 본인의 뜻은 그대로다
                        declined > 0 ? `거부 ${declined}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                    })()}
                  </p>
                )}
                {/* 거부가 있는데 노드는 여전히 "지금의 뜻"이다. 설명이 없으면
                    유족은 "가족이 반대했는데도 유효한가"로 읽는다 — 화면이 답한다 */}
                {acks[node.id]?.acks.some((x) => x.status === "DECLINED") && (
                  <p className="mt-1 rounded-lg bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-500">
                    가족의 확인은 동의가 아니라 <b>알고 있다는 기록</b>입니다. 거부하셨더라도
                    본인의 뜻은 그대로 유효하며, 거부하신 사실만 함께 남습니다.
                  </p>
                )}
                {node.witness && node.witness.length > 0 && (
                  <p className="mt-2 text-sm text-stone-500">
                    입회 {node.witness.map((w) => `${w.name}(${w.relation})`).join(", ")}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {data && data.nodes.length === 0 && (
        <Notice>아직 기록된 이력이 없습니다.</Notice>
      )}

      <ErrorNote error={error} />
    </Shell>
  );
}
