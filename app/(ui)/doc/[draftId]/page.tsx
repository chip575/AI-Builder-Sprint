// S5 문서 초안 + S6 서명 진행 (doc/DraftView · doc/SignPanel · FR-104 · FR-501 · FR-502 · FR-503)
// 게이트 배지가 이 화면의 핵심이다 — 판정은 서버가 이미 내렸고, 화면은 그 결과를 보여줄 뿐이다.
"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SignStatusRes } from "@/lib/contracts";
import { ErrorNote, Notice, PrimaryButton, Shell } from "../../_components/Shell";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "서명 전",
  REQUESTED: "서명 대기 중",
  COMPLETED: "서명 완료",
  REJECTED: "거절됨",
  CANCELED: "취소됨",
};

export default function DocPage() {
  const router = useRouter();
  const draftId = String(useParams().draftId);
  const [status, setStatus] = useState<SignStatusRes | null>(null);
  const [signUrl, setSignUrl] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    const body = await fetch(`/api/sign/${draftId}/status`).then((r) => r.json());
    if (body.ok) setStatus(body.data);
  }, [draftId]);

  useEffect(() => {
    void poll();
  }, [poll]);

  // 3초 폴링 — 완료되면 멈춘다 (02.4 §0)
  useEffect(() => {
    if (status?.status !== "REQUESTED") {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    timer.current = setInterval(() => void poll(), 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [status?.status, poll]);

  async function requestSign() {
    setBusy(true);
    setError(null);
    const body = await fetch(`/api/sign/${draftId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "LINK" }),
    }).then((r) => r.json());
    setBusy(false);
    if (!body.ok) return setError(body.error);
    setSignUrl(body.data.signUrl);
    // mock 문서 ID 확보 — 서명 완료 시뮬레이션용 (실 모드에선 서명자가 직접 서명한다)
    const docs = await fetch("/api/dev/documents").then((r) => r.json());
    if (docs.ok) {
      setDocId(docs.data.find((d: { draftId: string }) => d.draftId === draftId)?.documentId ?? null);
    }
    await poll();
  }

  async function simulateComplete() {
    if (!docId) return;
    setBusy(true);
    // 02.1.1 이관 규칙 — mock 버튼은 실제 webhook-sim 호출로 교체한다
    await fetch("/api/dev/webhook-sim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId, event: "document_all_signed" }),
    });
    setBusy(false);
    await poll();
  }

  return (
    <Shell title="약정서" fr={["FR-104", "FR-501", "FR-502", "FR-503"]}>
      <div className="space-y-5">
        <div className="rounded-xl border border-stone-300 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
              ESIGN_OK · 전자서명으로 효력이 생깁니다
            </span>
            <span className="text-sm text-stone-500">
              {STATUS_LABEL[status?.status ?? "DRAFT"]}
            </span>
          </div>
          <p className="mt-4 text-sm text-stone-500">문서 번호</p>
          <p className="font-mono text-sm break-all">{draftId}</p>
        </div>

        {status && status.parties.length > 0 && (
          <div className="rounded-xl border border-stone-300 bg-white p-4">
            <p className="text-sm text-stone-500">참여자</p>
            <ul className="mt-2 space-y-1">
              {status.parties.map((p, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span>{p.name}</span>
                  <span className={p.signedAt ? "text-emerald-700" : "text-stone-400"}>
                    {p.signedAt ? "서명함" : "대기"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {status?.rejectReason && (
          <Notice>거절 사유 — {status.rejectReason}</Notice>
        )}

        <ErrorNote error={error} />

        {status?.status === "DRAFT" && (
          <PrimaryButton onClick={() => void requestSign()} disabled={busy}>
            서명 요청하기
          </PrimaryButton>
        )}

        {status?.status === "REQUESTED" && (
          <div className="space-y-3">
            {signUrl && (
              <Notice>
                서명 링크가 발급됐습니다. 실제 서비스에서는 이 링크로 휴대폰에서 서명합니다.
              </Notice>
            )}
            <p className="text-center text-sm text-stone-500">서명을 기다리는 중…</p>
            {docId && (
              <button
                onClick={() => void simulateComplete()}
                disabled={busy}
                className="min-h-11 w-full rounded-xl border border-dashed border-stone-400 px-6 py-3 text-sm text-stone-600"
              >
                (데모) 서명 완료 시뮬레이션
              </button>
            )}
          </div>
        )}

        {status?.status === "COMPLETED" && (
          <PrimaryButton onClick={() => router.push(`/vault/${draftId}`)}>
            증빙 확인하기
          </PrimaryButton>
        )}
      </div>
    </Shell>
  );
}
