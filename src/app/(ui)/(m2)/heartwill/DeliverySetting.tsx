// S-HEARTWILL · 언제 누구에게 (FR-112)
//
// ⚠ 소유: 화면은 FE 경로다. BE-2가 사람 승인 하에 **새 파일로만** 추가 — 병합 전 FE 리뷰.
//
// ⚠ **보관과 발송은 다른 층이다.** 정해 두시는 것까지가 지금 되는 일이고, 정책마다
//   준비 상태가 다르다. 그 사실을 화면이 **서버가 준 문장 그대로** 말한다 —
//   화면이 짐작하면 "설정했는데 왜 안 갔죠"가 된다.
//   준비 안 된 정책을 감추지도 않는다: 감추면 사용자의 뜻을 적을 자리가 사라진다.
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Recipient } from "@/lib/contracts";
import { SectionHeading } from "@/app/(ui)/_components/HelpTip";

type Policy = "IMMEDIATE" | "SCHEDULED" | "POSTHUMOUS";

const POLICY_LABEL: Record<Policy, string> = {
  POSTHUMOUS: "제가 떠난 뒤에",
  SCHEDULED: "정한 날짜에",
  IMMEDIATE: "지금 바로",
};

export function DeliverySetting({ sessionId }: { sessionId: string }) {
  const [policy, setPolicy] = useState<Policy>("POSTHUMOUS");
  const [revealAt, setRevealAt] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [people, setPeople] = useState<Recipient[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    const [d, r] = await Promise.all([
      fetch(`/api/heartwill/delivery?sessionId=${sessionId}`).then((x) => x.json()).catch(() => null),
      fetch("/api/recipients").then((x) => x.json()).catch(() => null),
    ]);
    if (r?.ok) setPeople(r.data.recipients);
    if (d?.ok) {
      setPolicy(d.data.revealPolicy);
      setRevealAt(d.data.revealAt ? d.data.revealAt.slice(0, 10) : "");
      setChosen(new Set(d.data.recipientIds));
      setNote(d.data.note);
    } else {
      // 문단을 승인한 적이 없으면 전할 글이 없다 — 이 자리를 그리지 않는다
      setAvailable(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!available) return null;

  async function save() {
    setBusy(true);
    setMsg(null);
    const body = await fetch(`/api/heartwill/delivery?sessionId=${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revealPolicy: policy,
        // 날짜만 받는다 — 시각까지 물으면 "몇 시에 갈까"가 답이 없는 질문이 된다
        revealAt: policy === "SCHEDULED" && revealAt ? new Date(`${revealAt}T00:00:00Z`).toISOString() : null,
        recipientIds: [...chosen],
      }),
    }).then((r) => r.json());
    setBusy(false);
    if (!body.ok) return setMsg(`${body.error.message} ${body.error.nextAction}`);
    setNote(body.data.note);
    setMsg("정해 두었습니다.");
  }

  return (
    <section className="space-y-3 border-t border-stone-200 pt-8">
      <SectionHeading
        as="h3"
        title="언제, 누구에게"
        help={
          <>
            남기신 글을 언제 어느 분께 전할지 정해 두시는 곳입니다. 언제든 바꾸실 수 있습니다.
            <br />
            정해 두시는 것과 실제로 전해 드리는 것은 다른 단계입니다 — 어떤 방식이 아직
            준비 중인지는 고르시면 화면이 알려 드립니다. 준비 중이어도 정해 두신 내용은
            그대로 남습니다.
            <br />
            <strong>쓰는 법</strong> — 전할 시점과 받으실 분을 고르고 저장하시면 됩니다. 받으실 분은 마이페이지 주소록에서 옵니다.
          </>
        }
      />
      <fieldset>
        <legend className="sr-only">언제 전할까요</legend>
        <div className="space-y-2">
          {(Object.keys(POLICY_LABEL) as Policy[]).map((p) => (
            <label
              key={p}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-stone-800"
            >
              <input
                type="radio"
                name="revealPolicy"
                checked={policy === p}
                onChange={() => setPolicy(p)}
              />
              {POLICY_LABEL[p]}
            </label>
          ))}
        </div>
      </fieldset>

      {policy === "SCHEDULED" && (
        <div>
          <label className="block text-sm text-stone-500" htmlFor="revealAt">
            전할 날짜
          </label>
          <input
            id="revealAt"
            type="date"
            value={revealAt}
            onChange={(e) => setRevealAt(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-4 outline-none focus:border-stone-500"
          />
        </div>
      )}

      <div>
        <p className="text-sm text-stone-500">받으실 분</p>
        {people.length === 0 ? (
          // 왜 고를 수 없는지 말한다. 빈 목록만 있으면 고장인 줄 안다
          <p className="mt-1 text-sm text-stone-500">
            <strong>마이페이지 → 알릴 분</strong>에서 먼저 등록해 주세요.
          </p>
        ) : (
          <div className="mt-1 space-y-2">
            {people.map((r) => (
              <label
                key={r.id}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-stone-800"
              >
                <input
                  type="checkbox"
                  checked={chosen.has(r.id)}
                  onChange={(e) =>
                    setChosen((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      return next;
                    })
                  }
                />
                {r.name}
                {r.relation ? <span className="text-sm text-stone-500">({r.relation})</span> : null}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* 서버가 준 문장을 그대로 싣는다 — 화면이 "될 것 같다"를 지어내지 않는다 */}
      {note && <p className="text-sm text-stone-600">{note}</p>}
      {msg && <p className="text-sm text-stone-600">{msg}</p>}

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="min-h-11 w-full rounded-xl border border-stone-300 px-6 py-3 text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
      >
        {busy ? "저장 중…" : "이렇게 정해 두기"}
      </button>
    </section>
  );
}
