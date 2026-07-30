// S2 · 단일 진입 대화 (chat/SessionView · FR-101 · FR-110 · FR-115B)
// 트랙 선택 UI는 존재하지 않는다. 한 문장으로 시작하고, 명시적 의사면 가지로 직행한다.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { postSse } from "@/lib/sse";
import { ErrorNote, PrimaryButton, Shell } from "@/app/(ui)/_components/Shell";

interface Turn {
  role: "user" | "assistant";
  text: string;
}

const BRANCH_LABEL: Record<string, string> = {
  DONATION_NOW: "기부 약정",
  HERITAGE_SUPPORT: "문화유산 후원",
  LEGACY_GIFT: "유산 기부",
  HANDWRITTEN_WILL: "자필 유언",
  ESTATE: "자산 정리",
};

export default function ChatPage() {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text }, { role: "assistant", text: "" }]);

    try {
      // EventSource 불가 — POST SSE다 (lib/sse.ts 주석 참조)
      await postSse(
        "/api/session/message",
        { sessionId, text },
        {
          onToken: (chunk) =>
            setTurns((t) => {
              const next = [...t];
              const last = next[next.length - 1]!;
              next[next.length - 1] = { ...last, text: last.text + chunk };
              return next;
            }),
          // 라우팅 판단은 meta에서만 (스트림의 마지막 이벤트)
          onMeta: (meta) => {
            const m = meta as {
              sessionId: string;
              expressBranch?: { branchType: string } | null;
            };
            setSessionId(m.sessionId);
            if (m.expressBranch) setBranch(m.expressBranch.branchType);
          },
        },
      );
    } catch (e) {
      const payload = (e as { payload?: { error?: { message: string; nextAction: string } } })
        .payload;
      setError(
        payload?.error ?? {
          message: "연결이 원활하지 않았어요.",
          nextAction: "잠시 후 다시 시도해 주세요.",
        },
      );
      setTurns((t) => t.slice(0, -1)); // 빈 응답 말풍선 제거
    } finally {
      setBusy(false);
    }
  }

  async function toConfirm() {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId: sessionId }),
    });
    const body = await res.json();
    setBusy(false);
    if (!body.ok) return setError(body.error);
    router.push(`/confirm?intentId=${sessionId}`);
  }

  return (
    <Shell title="무엇을 남기고 싶으세요?" fr={["FR-101", "FR-110", "FR-115B"]}>
      <div className="space-y-4">
        {turns.length === 0 && (
          <p className="text-stone-500">
            떠오르는 대로 이야기해 주세요. 한 번에 하나씩 여쭐게요.
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-right" : ""}>
            <span
              className={
                t.role === "user"
                  ? "inline-block max-w-[85%] rounded-2xl bg-stone-900 px-4 py-3 text-left leading-relaxed text-stone-50"
                  : "inline-block max-w-[85%] rounded-2xl bg-white px-4 py-3 leading-relaxed text-stone-800 shadow-sm"
              }
            >
              {t.text || "…"}
            </span>
          </div>
        ))}
        <div ref={endRef} />

        {branch && (
          <div className="rounded-xl border border-stone-300 bg-white p-4">
            <p className="text-sm text-stone-500">진행 중인 정리</p>
            <p className="mt-1 font-medium">{BRANCH_LABEL[branch] ?? branch}</p>
          </div>
        )}

        <ErrorNote error={error} />
      </div>

      <div className="mt-6 space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 부산에 기부하고 싶어요"
            aria-label="하실 말씀"
            className="min-h-11 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-stone-500"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="min-h-11 rounded-xl bg-stone-900 px-5 text-stone-50 disabled:bg-stone-300"
          >
            보내기
          </button>
        </form>

        {sessionId && turns.length >= 2 && (
          <PrimaryButton onClick={() => void toConfirm()} disabled={busy}>
            정리된 내용 확인하기
          </PrimaryButton>
        )}
      </div>
    </Shell>
  );
}
