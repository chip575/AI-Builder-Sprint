// S-GUIDE · 서류 안내 대화 (FR-101 확장 · FR-115A)
//
// ⚠ 소유: 화면은 FE 경로다. 이 파일은 BE-1이 새 파일로만 추가한 초안이며
//   기존 FE 파일은 건드리지 않았다 — 배치·스타일 확정은 FE가 한다 (AGENTS.md 소유 절).
//
// 회상 대화(/chat)와 **같은 API**(/api/session/message)를 쓴다. 다른 것은 진입 프레임뿐:
//   · 여기는 "서류가 궁금해서 온 사람"의 문 — 질문 예시를 먼저 내민다
//   · 질문형은 안내 층이 조문과 함께 답하고 (LLM 비경유 · P3)
//   · 의사가 보이면 확인형 제안이 뜨며, 여는 것은 사용자다 (FR-115A · P1)
// 세션 키를 /chat과 분리한다 — 안내 대화와 회상 대화는 서로를 덮지 않는다.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { postSse } from "@/lib/sse";
import { ErrorNote, Shell } from "@/app/(ui)/_components/Shell";

interface Turn {
  role: "user" | "assistant";
  text: string;
}

interface Proposal {
  id: string;
  branchType: string;
  weight: string;
  /** 확인형 문구 — 서버가 만든 문장을 그대로 쓴다. 화면이 권유 문구를 지어내지 않는다 */
  message: string;
}

/** /chat과 다른 키 — 안내 대화가 회상 대화를 덮지 않는다 (보안 1조: id만 저장) */
const SESSION_KEY = "namgida.guideSessionId";

/** 첫 화면의 질문 예시 — 전부 질문형이라 안내 층이 받는다. 재촉 표현 없음 (P4) */
const STARTERS = [
  "유산 기부는 어떻게 하나요?",
  "유언장은 어떻게 남기나요?",
  "상속 포기는 언제까지 할 수 있나요?",
  "기부 약정은 어떻게 진행되나요?",
];

export default function GuidePage() {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  /** 이번 대화에서 정리된 이야기 수 — "정리된 내용 확인"으로 가는 길이 열렸는지의 신호 */
  const [covered, setCovered] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) setSessionId(saved);
  }, []);

  /** 제안에 대한 결정 — 여는 것도 닫는 것도 사용자다 (FR-115A) */
  async function decide(p: Proposal, action: "ACCEPT" | "DECLINE" | "DEFER") {
    setProposals((list) => list.filter((x) => x.id !== p.id));
    const res = await fetch(`/api/branch/${p.id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json();
    if (!body.ok) return setError(body.error);
  }

  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text }, { role: "assistant", text: "" }]);

    try {
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
          // 이 핸들러가 없으면 서버가 보낸 제안이 조용히 버려진다 (2026-08-01의 교훈)
          onProposal: (p) => setProposals((list) => [...list, p as Proposal]),
          onMeta: (meta) => {
            const m = meta as {
              sessionId: string;
              axisCoverage?: { answered: number }[];
            };
            if (m.axisCoverage) {
              setCovered(m.axisCoverage.reduce((n, c) => n + c.answered, 0));
            }
            setSessionId(m.sessionId);
            localStorage.setItem(SESSION_KEY, m.sessionId);
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
      setTurns((t) => t.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  async function toConfirm() {
    // 흐리게 두되 비활성화하지 않는다 — 눌러 보고 왜 안 되는지 들을 수 있어야 한다 (NFR-705)
    if (!sessionId) {
      return setError({
        message: "아직 정리할 이야기가 없어요.",
        nextAction: "궁금한 것을 묻거나, 남기고 싶은 마음을 한 문장 적어 주세요.",
      });
    }
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
    <Shell
      title="남길 서류, 무엇이 궁금하신가요"
      fr={["FR-101", "FR-115A"]}
      headerBar={{
        trailing: (
          <button
            type="button"
            onClick={() => void toConfirm()}
            className={`min-h-11 rounded-xl border px-3 text-sm transition ${
              covered && covered > 0
                ? "border-stone-400 bg-white text-stone-800 hover:bg-stone-100"
                : "border-stone-200 text-stone-500 hover:bg-stone-100 hover:text-stone-700"
            }`}
          >
            정리된 내용 확인
          </button>
        ),
      }}
      bottomBar={
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/chat"
              className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
            >
              마음 이야기를 나눌래요
            </Link>
            {/* P4 — 전 화면 필수 */}
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-stone-500 transition hover:bg-stone-100 hover:text-stone-700"
            >
              나중에 생각할래요
            </Link>
          </div>

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
              placeholder="예: 유산 기부는 어떻게 하나요?"
              aria-label="궁금하신 것"
              className="min-h-11 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-stone-500"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="min-h-11 rounded-xl bg-ink px-5 text-stone-50 disabled:bg-stone-300 disabled:text-stone-600"
            >
              보내기
            </button>
          </form>
        </div>
      }
    >
      <div className="space-y-4">
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="text-stone-500">
              기부·유산·유언 서류를 법이 인정하는 방식으로만 안내해 드립니다.
              답마다 근거 조문이 함께 붙습니다.
            </p>
            {/* 질문 예시 — 누르면 그 문장을 그대로 보낸다. 문 앞의 분류가 아니라 예시다 */}
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void send(q)}
                  className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 transition hover:bg-stone-100"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-right" : ""}>
            <span
              className={
                t.role === "user"
                  ? "inline-block max-w-[85%] rounded-2xl bg-ink px-4 py-3 text-left leading-relaxed text-stone-50"
                  : // 안내는 근거 줄이 길다 — 개행을 살려야 조문이 읽힌다
                    "inline-block max-w-[85%] whitespace-pre-line rounded-2xl bg-white px-4 py-3 font-serif leading-relaxed text-stone-800 shadow-sm"
              }
            >
              {t.text || "…"}
            </span>
          </div>
        ))}
        <div ref={endRef} />

        {/* 감지된 가지 (FR-115A) — 확인형 문구 그대로. 자동으로 넘어가지 않는다 (P4) */}
        {proposals.map((p) => (
          <div key={p.id} className="rounded-xl border border-stone-400 bg-white p-4">
            <p className="leading-relaxed text-stone-800">{p.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => void decide(p, "ACCEPT")}
                className="min-h-11 flex-1 rounded-xl bg-ink px-4 py-3 text-sm text-stone-50"
              >
                네, 그렇게 할게요
              </button>
              <button
                onClick={() => void decide(p, "DEFER")}
                className="min-h-11 flex-1 rounded-xl border border-stone-300 px-4 py-3 text-sm text-stone-600"
              >
                나중에 생각할래요
              </button>
              <button
                onClick={() => void decide(p, "DECLINE")}
                className="min-h-11 w-full text-sm text-stone-500 underline underline-offset-4"
              >
                이 이야기는 그만할게요
              </button>
            </div>
          </div>
        ))}

        <ErrorNote error={error} />
      </div>
    </Shell>
  );
}
