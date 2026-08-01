// S2 · 단일 진입 대화 (chat/SessionView · FR-101 · FR-110 · FR-115B)
// 트랙 선택 UI는 존재하지 않는다. 한 문장으로 시작하고, 명시적 의사면 가지로 직행한다.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { postSse } from "@/lib/sse";
import { ErrorNote, PrimaryButton, Shell } from "@/app/(ui)/_components/Shell";

interface Turn {
  role: "user" | "assistant";
  text: string;
}

/** 대화 중 감지된 가지 제안 (FR-115A · contracts/branch.ts BranchProposal) */
interface Proposal {
  id: string;
  branchType: string;
  weight: string;
  /** 확인형 문구 — 서버가 만든 문장을 그대로 쓴다. 화면이 권유 문구를 지어내지 않는다 */
  message: string;
}

/** 브라우저에 남기는 것은 세션 id뿐이다 — 내용은 서버에 있다 (보안 1조) */
const SESSION_KEY = "namgida.sessionId";

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
  /** 지난 세션에서 이어온 것인지 — 처음 온 사람과 돌아온 사람에게 다른 화면을 준다 */
  const [resumed, setResumed] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  /** 이번 대화에서 다뤄진 이야기 수 — 저장되고 있다는 것이 화면에 보여야 한다 */
  const [covered, setCovered] = useState<number | null>(null);
  /** 아직 사용자가 답하지 않은 가지 제안 — 답하면 목록에서 뺀다 */
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  /** 제안에 대한 사용자의 결정을 서버에 남긴다. 여는 것도 닫는 것도 사용자다 (FR-115A) */
  async function decide(p: Proposal, action: "ACCEPT" | "DECLINE" | "DEFER") {
    setProposals((list) => list.filter((x) => x.id !== p.id));
    const res = await fetch(`/api/branch/${p.id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json();
    if (!body.ok) return setError(body.error);
    // 무거운 가지는 승낙만으로 열리지 않는다 — 서버가 재확인 상태를 돌려준다 (FR-115B)
    if (body.data.status === "OPENED") setBranch(p.branchType);
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  // 세션 주기와 무관하게 이어쓴다 — 화면 상태로만 들고 있으면 새로 들어온 순간
  // 지난 이야기로 돌아갈 길이 없어진다 (D-07 · FR-113)
  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (!saved) return;
    setSessionId(saved);
    setResumed(true);
    // 무엇이 정리돼 있는지 숫자로 보인다 — "저장됐나?"를 사용자가 알 수 있어야 한다
    fetch(`/api/facts?intentId=${saved}`)
      .then((r) => r.json())
      .then((b) => setSavedCount(b.ok ? (b.data.facts?.length ?? 0) : 0))
      .catch(() => setSavedCount(null));
  }, []);

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
          // 대화 중 감지된 가지 (FR-115A). 여는 것은 사용자다 — 자동으로 넘어가지 않는다.
          // 이 핸들러가 없으면 서버가 보낸 제안이 조용히 버려진다
          onProposal: (p) => setProposals((list) => [...list, p as Proposal]),
          // 라우팅 판단은 meta에서만 (스트림의 마지막 이벤트)
          onMeta: (meta) => {
            const m = meta as {
              sessionId: string;
              expressBranch?: { branchType: string } | null;
              axisCoverage?: { answered: number }[];
            };
            if (m.axisCoverage) {
              setCovered(m.axisCoverage.reduce((n, c) => n + c.answered, 0));
            }
            setSessionId(m.sessionId);
            // 다음에 들어와도 이 대화로 돌아올 수 있게 남긴다
            localStorage.setItem(SESSION_KEY, m.sessionId);
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
    <Shell title="무엇을 남기고 싶으신가요" fr={["FR-101", "FR-110", "FR-115B"]}>
      <div className="space-y-4">
        {turns.length === 0 && resumed && (
          <div className="rounded-xl border border-stone-300 bg-white p-4">
            <p className="font-medium text-stone-800">지난번 이야기를 이어갑니다.</p>
            <p className="mt-1 text-sm text-stone-600">
              {savedCount === null
                ? "그동안 남기신 내용은 그대로 있습니다."
                : `그동안 ${savedCount}가지가 정리되어 있습니다. 아래에서 확인하실 수 있어요.`}
            </p>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(SESSION_KEY);
                setSessionId(null);
                setResumed(false);
                setSavedCount(null);
              }}
              className="mt-3 min-h-11 text-sm text-stone-500 underline underline-offset-4"
            >
              새로 시작할게요
            </button>
          </div>
        )}
        {turns.length === 0 && !resumed && (
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
                  : // 묻는 쪽만 명조 — 버튼·라벨의 고딕과 대비를 만든다
                    "inline-block max-w-[85%] rounded-2xl bg-white px-4 py-3 font-serif leading-relaxed text-stone-800 shadow-sm"
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

        {/* 말한 내용이 남고 있다는 신호. 없으면 사용자는 저장됐는지 알 방법이 없다 */}
        {covered !== null && covered > 0 && (
          <p className="text-sm text-stone-500">
            지금까지 {covered}가지 이야기가 정리되어 있습니다. 다음에 오셔도 이어집니다.
          </p>
        )}

        {/* 대화 중 감지된 가지 (FR-115A) — 확인형 문구 그대로. 자동으로 넘어가지 않는다.
            "나중에 생각할래요"가 항상 있어야 한다 (P4) */}
        {proposals.map((p) => (
          <div key={p.id} className="rounded-xl border border-stone-400 bg-white p-4">
            <p className="leading-relaxed text-stone-800">{p.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => void decide(p, "ACCEPT")}
                className="min-h-11 flex-1 rounded-xl bg-stone-900 px-4 py-3 text-sm text-stone-50"
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

        {/* 회상은 **축 세션의 일부**지 별도 트랙이 아니다 — 그래서 홈이 아니라
            대화 안에서 이어진다. 대화 중 제안이므로 FR-110의 트랙 선택에 해당하지 않는다 */}
        <Link
          href="/recall"
          className="inline-block text-sm text-stone-500 underline underline-offset-4 hover:text-stone-700"
        >
          천천히 회상하며 정리해 볼까요?
        </Link>

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

        {/* 돌아온 사람에게도 보여야 한다 — 이 조건이 turns에만 걸려 있으면
            새로 들어온 순간 지난 이야기로 가는 길이 사라진다 */}
        {sessionId && (turns.length >= 2 || resumed) && (
          <PrimaryButton onClick={() => void toConfirm()} disabled={busy}>
            정리된 내용 확인하기
          </PrimaryButton>
        )}
      </div>
    </Shell>
  );
}
