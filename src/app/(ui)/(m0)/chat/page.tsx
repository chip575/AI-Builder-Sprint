// S2 · 단일 진입 대화 (chat/SessionView · FR-101 · FR-110 · FR-115B)
// 트랙 선택 UI는 존재하지 않는다. 한 문장으로 시작하고, 명시적 의사면 가지로 직행한다.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { postSse } from "@/lib/sse";
import { docLabel } from "@/lib/docs/labels";
import { ErrorNote, Shell } from "@/app/(ui)/_components/Shell";
import { AssetPeek } from "@/app/(ui)/_components/AssetPeek";
import { suggestionTexts } from "@/lib/ai/session/suggested";

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
  // 처음엔 펴 둔다 — 지금 사용자가 겪는 문제는 "무엇을 물어봐도 되는지 모르는 것"이다.
  // 한 번 말을 걸면 접는다: 대화가 시작된 뒤에도 계속 떠 있으면 화면이 빽빽해진다
  const [suggestOpen, setSuggestOpen] = useState(true);
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
  /** 안내가 권한 서류 — 말로만 권하고 끝나지 않게 문을 함께 연다 (2026-08-03) */
  const [suggestedDoc, setSuggestedDoc] = useState<string | null>(null);
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

  async function send(preset?: string) {
    // 추천 질문은 입력창을 거치지 않고 바로 보낸다 — 칸에 넣어 두고 다시 누르게 하면
    // "이걸 눌러도 되나" 하고 멈춘다
    const text = (preset ?? input).trim();
    if (!text || busy) return;
    setSuggestOpen(false);
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
              suggestedDoc?: string | null;
            };
            // null이면 지운다 — 지난 턴의 권유가 화면에 남아 있으면 지금 대화와 어긋난다
            setSuggestedDoc(m.suggestedDoc ?? null);
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
    // 버튼을 조용히 죽이지 않는다 — 눌렀는데 아무 일도 없으면 사용자는 원인을 모른다.
    // 흐리게 두되 비활성화하지 않는 이유가 이것이다 (NFR-705)
    if (!sessionId) {
      return setError({
        message: "아직 정리할 이야기가 없어요.",
        nextAction: "아래에 한 문장만 남겨 주시면 바로 정리해 드릴게요.",
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

  /** 지난 세션을 버리고 처음부터 — 곁칸의 "새로 시작할게요" */
  function reset() {
    localStorage.removeItem(SESSION_KEY);
    setSessionId(null);
    setResumed(false);
    setSavedCount(null);
  }

  // 같은 정보를 두 번 말하지 않는다 — 이번 대화의 수가 있으면 그것이, 없으면 지난 세션의 수가
  // 곁칸의 유일한 숫자가 된다 (분모는 붙이지 않는다 · P4)
  const storyCount = covered ?? savedCount;

  return (
    <Shell
      title="무엇을 남기고 싶으신가요"
      fr={["FR-101", "FR-110", "FR-115B"]}
      headerBar={{
        // leading은 Shell이 채운다 — 이동용 곁칸 토글이 전 화면 같은 자리에 선다
        // 흐리게 두되 **비활성화하지 않는다** — 눌러 보고 왜 안 되는지 들을 수 있어야 한다
        trailing: (
          <button
            type="button"
            onClick={() => void toConfirm()}
            className={`min-h-11 rounded-xl border px-3 text-sm transition ${
              storyCount && storyCount > 0
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
          {/* 성격이 다른 두 문 — 왼쪽은 다른 방식으로 계속하기, 오른쪽은 여기서 멈추기.
              같은 모양으로 만들면 무게가 같아 보인다 */}
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/recall"
              className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
            >
              천천히 회상할래요
            </Link>
            {/* P4 — 전 화면 필수 항목. Shell의 고정 버튼 대신 여기 산다.
                곁칸이 열려도 덮이지 않는 것은 Shell이 하단 바 자체에 z-50을 걸어 두기 때문이다 */}
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-stone-500 transition hover:bg-stone-100 hover:text-stone-700"
            >
              나중에 생각할래요
            </Link>
          </div>

          {/* 자산 확인 — 유산·기부를 정리하는 중에 "내가 뭘 가지고 있더라"를
              여기서 본다. 나가면 쓰던 내용이 사라지므로 화면 안에서 편다 */}
          <div className="mb-2">
            <AssetPeek />
          </div>

          {/* 추천 질문 — 목록은 안내층(lib/ai/session/suggested)에서 온다.
              손으로 예시를 박아두면 주제 규칙이 바뀔 때 눌러도 답이 안 나오는 버튼이 된다.
              여기 있는 문장은 전부 detectGuide가 답한다는 것을 테스트가 고정한다 */}
          <div className="mb-2">
            {suggestOpen ? (
              <div className="flex flex-wrap gap-2">
                {suggestionTexts().map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    disabled={busy}
                    className="min-h-11 rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-700 transition hover:border-stone-500 hover:bg-stone-100 disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : (
              // 접힌 뒤에도 다시 열 수 있어야 한다 — 대화 중에 막혔을 때가 오히려
              // 이 목록이 가장 필요한 순간이다
              <button
                type="button"
                onClick={() => setSuggestOpen(true)}
                className="min-h-11 rounded-xl px-2 text-sm text-stone-500 transition hover:bg-stone-100 hover:text-stone-700"
              >
                무엇을 여쭤볼 수 있나요?
              </button>
            )}
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
              placeholder="예: 고향에 기부하고 싶어요"
              aria-label="하실 말씀"
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
      {/* 대화 맥락은 곁칸이 아니라 본문에 둔다 — 곁칸은 이제 "화면 사이를 옮기는 문"이라
          성격이 다르다. 다만 카드로 쌓으면 화면이 다시 빽빽해지므로 한 줄로 줄인다.
          ⚠ 숫자는 세어주기까지만 — 분모·막대를 붙이지 않는다 (P4 · FR-111) */}
      {(resumed || branch) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
          {resumed && <span>지난번 이야기를 이어갑니다.</span>}
          {storyCount !== null && storyCount > 0 && (
            <span className="text-stone-500">
              지금까지 {storyCount}가지가 정리되어 있어요.
            </span>
          )}
          {branch && (
            <span className="text-stone-500">
              진행 중 — {BRANCH_LABEL[branch] ?? branch}
            </span>
          )}
          {resumed && (
            <button
              type="button"
              onClick={reset}
              className="min-h-11 text-stone-500 underline underline-offset-4 hover:text-stone-700"
            >
              새로 시작할게요
            </button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {/* 이어온 사람에게도 첫 화면이 비어 보이지 않게 한다 — 지난 대화 안내는 곁칸에 있다 */}
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
                  ? "inline-block max-w-[85%] rounded-2xl bg-ink px-4 py-3 text-left leading-relaxed text-stone-50"
                  : // 묻는 쪽만 명조 — 버튼·라벨의 고딕과 대비를 만든다
                    "inline-block max-w-[85%] rounded-2xl bg-white px-4 py-3 font-serif leading-relaxed text-stone-800 shadow-sm"
              }
            >
              {t.text || "…"}
            </span>
          </div>
        ))}
        <div ref={endRef} />

        {/* 대화 중 감지된 가지 (FR-115A) — 확인형 문구 그대로. 자동으로 넘어가지 않는다.
            "나중에 생각할래요"가 항상 있어야 한다 (P4) */}
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

        {/* 안내가 서류를 권했다 — 그 서류의 작성실로 바로 들어가는 문.
            안내가 길만 알려 주고 문은 안 열어 주면 사용자가 직접 찾아가야 한다 */}
        {suggestedDoc && (
          <div className="rounded-xl border border-stone-300 bg-white p-4">
            <p className="text-sm text-stone-600">
              말씀하신 상황에는 <strong className="text-stone-900">{docLabel(suggestedDoc)}</strong>가
              맞습니다.
            </p>
            <Link
              // 작성실이 여는 서류는 셋뿐이다. 자필 유언은 서명 화면이 없어(절대규칙 4)
              // 안내 대화로 보낸다 — 없는 문을 가리키면 눌러도 아무 일이 없다
              href={
                ["DONATION_PLEDGE", "HERITAGE_SUPPORT_PLEDGE", "LEGACY_GIFT_AGREEMENT"].includes(
                  suggestedDoc,
                )
                  ? `/write?doc=${suggestedDoc}`
                  : "/guide"
              }
              className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm text-stone-50"
            >
              {["DONATION_PLEDGE", "HERITAGE_SUPPORT_PLEDGE", "LEGACY_GIFT_AGREEMENT"].includes(
                suggestedDoc,
              )
                ? `${docLabel(suggestedDoc)} 쓰러 가기`
                : `${docLabel(suggestedDoc)} 안내 보기`}
            </Link>
          </div>
        )}

        <ErrorNote error={error} />
      </div>
    </Shell>
  );
}
