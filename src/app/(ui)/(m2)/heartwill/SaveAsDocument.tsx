// S-HEARTWILL · 서류로 남기기 (FR-111 · FR-112)
//
// ⚠ 소유: 화면은 FE 경로다. BE-2가 사람 승인 하에 **새 파일로만** 추가 — 병합 전 FE 리뷰.
//
// 지금까지 마음 유언은 **서랍에 들어가지 않았다.** 문단을 승인해 버전은 쌓였는데
// 서류 이력(CLM)에는 안 뜨고, 사용자는 "어디에 저장된 거지"를 알 수 없었다.
//
// ⚠ 서명 버튼이 아니다. 게이트가 NON_BINDING을 내는 문서라 서명할 자리가 없다 —
//   버튼 글자를 "서명하기"로 쓰면 그 순간 이 문서가 무엇인지 흐려진다 (절대규칙 4의 정신).
"use client";

import Link from "next/link";
import { useState } from "react";
import { SectionHeading } from "@/app/(ui)/_components/HelpTip";

export function SaveAsDocument({
  sessionId,
  bodyCount,
}: {
  sessionId: string;
  /** 승인된 문단 수. 0이면 아직 문서가 아니다 (P1) */
  bodyCount: number;
}) {
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const body = await fetch("/api/heartwill/document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setBusy(false);
    if (!body?.ok) {
      return setMsg(
        body?.error ? `${body.error.message} ${body.error.nextAction}` : "지금은 저장하지 못했습니다.",
      );
    }
    setDraftId(body.data.draftId);
    // 두 번 눌러도 새로 만들지 않는다 — 서버가 같은 문서를 돌려준다
    setMsg(
      body.data.created
        ? "서류 이력에 넣었습니다."
        : "이미 서류 이력에 들어 있습니다. 문단을 고치시면 그대로 반영됩니다.",
    );
  }

  return (
    <section className="space-y-2 border-t border-stone-200 pt-8">
      <SectionHeading
        as="h3"
        title="서류로 남기기"
        help={
          <>
            고르신 문장을 <strong>서류 이력</strong>에 넣어 둡니다. 남기신 날짜와 함께
            언제든 다시 찾아보실 수 있습니다.
            <br />
            서명하지 않는 문서라 서명란이 없습니다 — 마음을 남겨 두는 기록이지 법적 효력이
            있는 서류가 아닙니다.
          </>
        }
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || bodyCount === 0}
        className="min-h-11 w-full rounded-xl border border-stone-300 px-6 py-3 text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
      >
        {busy ? "저장 중…" : "서류 이력에 넣기"}
      </button>
      {bodyCount === 0 && (
        // 왜 눌러지지 않는지 말한다. 회색 버튼만 있으면 고장인 줄 안다
        <p className="text-sm text-stone-500">
          먼저 위에서 남기실 문장을 하나 이상 골라 주세요.
        </p>
      )}
      {msg && <p className="text-sm text-stone-600">{msg}</p>}
      {draftId && (
        <Link href="/clm" className="inline-block text-sm text-ink underline underline-offset-4">
          서류 이력에서 보기
        </Link>
      )}
    </section>
  );
}
