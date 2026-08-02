// S-RECALL · 회상 인터뷰 — 1화면 1질문 (FR-301 · FR-110)
//
// 이 화면의 규칙은 "한 번에 하나만 묻는다"이다. 질문을 여러 개 늘어놓으면
// 설문지가 되고, 설문지는 이야기를 끌어내지 못한다.
// 질문 문장·순서·머무름 문구는 전부 lib/rules/question-bank.ts가 정한다 — 화면은 고르지 않는다.
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { postSse } from "@/lib/sse";
import { ErrorNote, Notice, PrimaryButton, Shell } from "@/app/(ui)/_components/Shell";
import {
  AXES,
  needsPause,
  nextQuestion,
  PAUSE_PROMPT,
} from "@/lib/rules/question-bank";
import type { Question } from "@/lib/contracts";

const AXIS_LABEL = new Map(AXES.map((a) => [a.id as string, a.label as string]));

/** 브라우저에 남기는 것은 세션 id뿐이다 — 내용은 서버에 있다 (보안 1조).
 *  /chat·/guide·/write와 같은 규칙이다. 이게 없으면 새로고침 한 번에 회상 세션이
 *  사라지고, 마음 유언으로 가는 길(=sessionId)도 함께 끊긴다 */
const SESSION_KEY = "namgida.recallSessionId";

export default function RecallPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [asked, setAsked] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [question, setQuestion] = useState<Question | null>(() =>
    nextQuestion({ utterances: [], askedIds: [], skippedIds: [] }),
  );
  const [input, setInput] = useState("");
  const [reply, setReply] = useState("");
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);

  // 지난 회상으로 돌아온다 — 세션 주기와 무관하게 이어쓴다 (FR-110 · D-07)
  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) setSessionId(saved);
  }, []);

  /** 다음 질문으로. 건너뛴 질문은 목록에서 영구히 빠진다 (FR-301 수락 기준) */
  function advance(nextAnswers: string[], nextAsked: string[], nextSkipped: string[]) {
    setQuestion(
      nextQuestion({
        utterances: nextAnswers,
        askedIds: nextAsked,
        skippedIds: nextSkipped,
      }),
    );
    setPaused(false);
    setReply("");
  }

  async function submit() {
    const text = input.trim();
    if (busy || !question) return;
    // 버튼을 조용히 죽이지 않는다 — 빈 채로 눌러도 왜 안 되는지 들을 수 있어야 한다 (NFR-705)
    if (!text) {
      return setError({
        message: "아직 적으신 내용이 없어요.",
        nextAction: "위 칸에 떠오르는 대로 한 문장만 적어 주세요. 짧아도 괜찮습니다.",
      });
    }
    setBusy(true);
    setError(null);
    setInput("");
    setReply("");

    try {
      await postSse(
        "/api/session/message",
        { sessionId, text },
        {
          onToken: (t) => setReply((prev) => prev + t),
          onMeta: (m) => {
            // axisCoverage도 함께 오지만 화면은 쓰지 않는다 — 셈을 보여주지 않기로 했다
            const meta = m as { sessionId: string };
            setSessionId(meta.sessionId);
            // 다음에 들어와도 이 회상으로 돌아올 수 있게 남긴다
            localStorage.setItem(SESSION_KEY, meta.sessionId);
          },
        },
      );

      const nextAnswers = [...answers, text];
      const nextAsked = [...asked, question.id];
      setAnswers(nextAnswers);
      setAsked(nextAsked);

      // 상실을 말한 직후에 다음 질문을 들이밀지 않는다 — 머무를지 스스로 고른다
      if (needsPause(text)) setPaused(true);
      else advance(nextAnswers, nextAsked, skipped);
    } catch (err) {
      const body = err as { error?: { message: string; nextAction: string } };
      setError(
        body?.error ?? {
          message: "이야기를 저장하지 못했습니다.",
          nextAction: "잠시 후 다시 시도해 주세요.",
        },
      );
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    if (!question) return;
    const nextSkipped = [...skipped, question.id];
    setSkipped(nextSkipped);
    advance(answers, asked, nextSkipped);
  }

  return (
    // 돌아갈 곳은 "내 유산"이다 — 마음 이야기로 들어오는 문이 거기에 있다 (2026-08-02 개편)
    <Shell title="회상" fr={["FR-301", "FR-110"]} back={{ href: "/estate", label: "이전으로" }}>
      {/* 커버리지 카드를 걷어냈다 (진행률 바 5개 · N/4 분수 · "전체 20" 총량).
          축을 다 채워야 끝나는 과제로 읽히기 때문이다. 마음 유언은 완성 시점이 따로
          없고 갱신되는 과정 자체가 산출물이다 (FR-111) — 셈이 있으면 그 말이 거짓이 된다.
          ⚠ 대체물을 두지 않는다. "지금까지 N가지"도 결국 얼마나 채웠나로 읽힌다 (P4). */}

      {reply && (
        <p className="mb-6 whitespace-pre-wrap rounded-xl bg-stone-100 p-4 text-stone-800">
          {reply}
        </p>
      )}

      {paused ? (
        // 머무름 — 다음 질문을 밀어내는 자리. 문구는 룰테이블이 정한다
        <section className="space-y-4">
          <p className="text-lg text-stone-800">{PAUSE_PROMPT.message}</p>
          <div className="flex flex-wrap gap-2">
            {PAUSE_PROMPT.choices.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  if (c.id === "NEXT") advance(answers, asked, skipped);
                  else if (c.id === "STAY") setPaused(false);
                  else setQuestion(null); // 오늘은 여기까지 — 세션은 그대로 남는다
                }}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-100"
              >
                {c.label}
              </button>
            ))}
          </div>
        </section>
      ) : question ? (
        <section className="space-y-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">
            {AXIS_LABEL.get(question.axis) ?? question.axis}
          </p>
          {/* 한 번에 한 질문 — 여기에 질문이 둘 이상 렌더되면 설문지가 된다.
              질문문만 명조로 둔다. 아래 버튼·건너뛰기는 고딕 그대로다 */}
          <h2 className="font-serif text-xl leading-relaxed text-stone-900">
            {question.text}
          </h2>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={5}
            placeholder="편하게 말씀하듯 적어 주세요."
            className="w-full rounded-xl border border-stone-300 p-4 text-stone-900 outline-none focus:border-stone-500"
          />

          <div className="flex items-center gap-3">
            {/* 빈 입력으로 죽이지 않는다 — 눌렀을 때 무엇이 모자란지 말해 준다 (NFR-705).
                회색으로 두되 비활성화하지 않는 이유가 이것이다 */}
            <PrimaryButton onClick={submit} disabled={busy}>
              {busy ? "남기는 중…" : "이 이야기 남기기"}
            </PrimaryButton>
            {/* 건너뛴 질문은 다시 묻지 않는다 */}
            <button
              type="button"
              onClick={skip}
              disabled={busy}
              // whitespace-nowrap — 좁은 화면에서 "이 질문은 / 건너뛸게요"로 갈라졌다
              className="shrink-0 whitespace-nowrap text-sm text-stone-500 underline underline-offset-4 hover:text-stone-700"
            >
              이 질문은 건너뛸게요
            </button>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <p className="text-lg text-stone-800">
            오늘 남기신 이야기는 그대로 저장되었습니다.
          </p>
          <Notice>
            다음에 오시면 이어서 하실 수 있습니다. 남긴 이야기는 마음 유언의 바탕이 됩니다.
          </Notice>
          {/* "마음 유언의 바탕이 됩니다"라고 말했으면 거기로 가는 길이 있어야 한다.
              sessionId를 실어 보낸다 — 사용자가 대화 번호를 손으로 적을 방법은 없다 */}
          {sessionId && (
            <Link
              href={`/heartwill?sessionId=${sessionId}`}
              className="inline-flex min-h-11 items-center rounded-xl bg-ink px-6 text-stone-50 transition hover:bg-ink-hover"
            >
              마음 유언 정리해 보기
            </Link>
          )}
        </section>
      )}

      <ErrorNote error={error} />
    </Shell>
  );
}
