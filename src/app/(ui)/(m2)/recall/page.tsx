// S-RECALL · 회상 인터뷰 — 1화면 1질문 (FR-301 · FR-110)
//
// 이 화면의 규칙은 "한 번에 하나만 묻는다"이다. 질문을 여러 개 늘어놓으면
// 설문지가 되고, 설문지는 이야기를 끌어내지 못한다.
// 질문 문장·순서·머무름 문구는 전부 lib/rules/question-bank.ts가 정한다 — 화면은 고르지 않는다.
"use client";

import { useState } from "react";
import { postSse } from "@/lib/sse";
import { ErrorNote, Notice, PrimaryButton, Shell } from "@/app/(ui)/_components/Shell";
import {
  AXES,
  needsPause,
  nextQuestion,
  PAUSE_PROMPT,
} from "@/lib/rules/question-bank";
import type { AxisCoverage } from "@/lib/contracts";
import type { Question } from "@/lib/contracts";

const AXIS_LABEL = new Map(AXES.map((a) => [a.id as string, a.label as string]));

export default function RecallPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [asked, setAsked] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [question, setQuestion] = useState<Question | null>(() =>
    nextQuestion({ utterances: [], askedIds: [], skippedIds: [] }),
  );
  const [coverage, setCoverage] = useState<AxisCoverage>([]);
  const [input, setInput] = useState("");
  const [reply, setReply] = useState("");
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);

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
    if (!text || busy || !question) return;
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
            const meta = m as { sessionId: string; axisCoverage: AxisCoverage };
            setSessionId(meta.sessionId);
            setCoverage(meta.axisCoverage);
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

  const answeredTotal = coverage.reduce((n, c) => n + c.answered, 0);
  const grandTotal = coverage.reduce((n, c) => n + c.total, 0);

  return (
    <Shell title="회상" fr={["FR-301", "FR-110"]} back={{ href: "/chat", label: "대화로" }}>
      {/* 커버리지 — 진도가 아니라 "어느 이야기를 아직 안 했나"를 보여준다 */}
      {coverage.length > 0 && (
        <section className="mb-6 rounded-xl border border-stone-200 p-4">
          <p className="mb-3 text-sm text-stone-600">
            지금까지 {answeredTotal}가지 이야기를 남기셨습니다 (전체 {grandTotal})
          </p>
          <ul className="space-y-2">
            {coverage.map((c) => (
              <li key={c.axis} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-stone-700">
                  {AXIS_LABEL.get(c.axis) ?? c.axis}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200">
                  <span
                    className="block h-full bg-stone-500"
                    style={{ width: `${(c.answered / c.total) * 100}%` }}
                  />
                </span>
                <span className="w-10 shrink-0 text-right text-stone-500">
                  {c.answered}/{c.total}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
          <p className="text-xs uppercase tracking-wide text-stone-400">
            {AXIS_LABEL.get(question.axis) ?? question.axis}
          </p>
          {/* 한 번에 한 질문 — 여기에 질문이 둘 이상 렌더되면 설문지가 된다 */}
          <h2 className="text-xl leading-relaxed text-stone-900">{question.text}</h2>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={5}
            placeholder="편하게 말씀하듯 적어 주세요."
            className="w-full rounded-xl border border-stone-300 p-4 text-stone-900 outline-none focus:border-stone-500"
          />

          <div className="flex items-center gap-3">
            <PrimaryButton onClick={submit} disabled={busy || input.trim() === ""}>
              {busy ? "남기는 중…" : "이 이야기 남기기"}
            </PrimaryButton>
            {/* 건너뛴 질문은 다시 묻지 않는다 */}
            <button
              type="button"
              onClick={skip}
              disabled={busy}
              className="text-sm text-stone-500 underline underline-offset-4 hover:text-stone-700"
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
        </section>
      )}

      <ErrorNote error={error} />
    </Shell>
  );
}
