// S5 문서 초안 + S6 서명 진행 (doc/DraftView · doc/SignPanel · FR-104 · FR-501 · FR-502 · FR-503)
// 게이트 배지가 이 화면의 핵심이다 — 판정은 서버가 이미 내렸고, 화면은 그 결과를 보여줄 뿐이다.
"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SignStatusRes } from "@/lib/contracts";
import { ErrorNote, Notice, PrimaryButton, Shell } from "@/app/(ui)/_components/Shell";

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
  /** 서명 요청 확인 단계 — 되돌릴 수 없는 행동 앞에 한 번 멈춘다 */
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState(false);
  /** 어디로 보내는지 — 마이페이지 연락처가 아니라 **로그인 계정**으로 간다 */
  const [sendTo, setSendTo] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    const body = await fetch(`/api/sign/${draftId}/status`).then((r) => r.json());
    if (body.ok) setStatus(body.data);
  }, [draftId]);

  useEffect(() => {
    // 확인 화면에 보여줄 수신 주소. 실패해도 확인 단계는 뜬다 (주소만 생략)
    void fetch("/api/me")
      .then((r) => r.json())
      .then((b) => setSendTo(b.ok ? b.data.email : null))
      .catch(() => setSendTo(null));
  }, []);

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
    if (!body.ok) {
      // 실패하면 확인 화면에 머문다 — 닫아버리면 무엇이 잘못됐는지 보고도
      // 다시 시도할 자리가 사라진다
      return setError(body.error);
    }
    setConfirming(false);
    setSent(true);
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
                  <span className={p.signedAt ? "text-emerald-700" : "text-stone-500"}>
                    {p.signedAt ? "서명함" : "대기"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {status?.rejectReason && (
          <Notice>
            거절 사유 — {status.rejectReason}
            <br />
            {/* 거절은 실패가 아니라 상대의 의사다. 문구가 사용자를 탓하지 않게 한다 */}
            서명하지 않기로 한 것도 상대의 마음입니다. 어떤 생각이셨는지 이야기를
            나눠 보셔도 좋고, 지금은 그대로 두셔도 괜찮습니다.
          </Notice>
        )}

        <ErrorNote error={error} />

        {status?.status === "DRAFT" && !confirming && (
          <PrimaryButton onClick={() => setConfirming(true)} disabled={busy}>
            서명 요청하기
          </PrimaryButton>
        )}

        {/* 확인 단계 — 서명 요청은 되돌릴 수 없다. 상대에게 메일이 나가고
            요청 잔여가 줄어든다. **어디로 가는지**를 보여주지 않으면 확인이 아니다 */}
        {status?.status === "DRAFT" && confirming && (
          <div className="space-y-3 rounded-xl border border-stone-400 bg-white p-4">
            <p className="leading-relaxed text-stone-800">
              {sendTo ? (
                <>
                  등록된 이메일 <strong>{sendTo}</strong>(으)로 서명 요청을 보냅니다.
                </>
              ) : (
                "등록된 이메일로 서명 요청을 보냅니다."
              )}
            </p>
            <p className="text-sm text-stone-500">
              보내고 나면 취소하실 수 있지만, 상대에게는 이미 안내가 갑니다.
            </p>
            <div className="flex gap-2">
              <PrimaryButton onClick={() => void requestSign()} disabled={busy}>
                {busy ? "전송 중…" : "보내기"}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="min-h-11 flex-1 rounded-xl border border-stone-300 px-4 text-sm text-stone-600"
              >
                아직요
              </button>
            </div>
            <a href="/mypage" className="block text-sm text-ink underline underline-offset-4">
              보내는 사람 정보 확인하기
            </a>
          </div>
        )}

        {sent && status?.status === "REQUESTED" && (
          <p className="text-center text-sm text-stone-600">전송 완료</p>
        )}

        {status?.status === "REQUESTED" && (
          <div className="space-y-3">
            {signUrl && (
              <Notice>
                서명 링크가 발급됐습니다. 실제 서비스에서는 이 링크로 휴대폰에서 서명합니다.
              </Notice>
            )}
            <p className="text-center text-sm text-stone-500">서명을 기다리는 중…</p>
            {docId && process.env.NEXT_PUBLIC_DEV_UI === "1" && (
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
