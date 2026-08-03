// S-MYPAGE · 알릴 분 (FR-405 · FR-112 · NFR-714)
//
// ⚠ 소유: 화면은 FE 경로다. BE-2가 사람 승인 하에 **새 파일로만** 추가 — 병합 전 FE 리뷰.
//
// 기관과 유족을 한 목록에 둔다. 역할은 다르지만 하는 일이 같다 —
// 이름과 이메일을 적어 두고, 나중에 무언가를 보낸다.
//
// ⚠ 목록에서는 이메일을 **마스킹**한다. 전체는 발송 직전 확인 화면에서만 보여준다
//   (통지서에 이름과 약정 내용이 실리므로, 틀린 주소로 가면 그게 곧 유출이다 —
//   그래서 확인할 기회는 남기되 평소에는 가린다).
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Recipient, RecipientKind } from "@/lib/contracts";
import { SectionHeading } from "@/app/(ui)/_components/HelpTip";

/** 역할 이름은 **하는 일**로 짓는다. 코드명(CUSTODIAN)을 화면에 노출하지 않는다 */
/** 화면에 내놓는 역할 — **기관과 유족 둘뿐이다.**
 *  ⚠ 계약(RecipientKind)에는 CUSTODIAN도 있지만 화면에서 뺐다 (2026-08-03 결정):
 *    "지킴이"라는 말이 직관적이지 않아 사용자가 무엇을 맡기는 것인지 알기 어려웠다.
 *    배선(API·테이블)은 남아 있어 필요해지면 되살릴 수 있다. */
const KIND_LABEL: Partial<Record<RecipientKind, string>> = {
  ORG: "받으실 곳",
  FAMILY: "유족",
};

const KIND_HINT: Partial<Record<RecipientKind, string>> = {
  ORG: "약정을 맺는 기관입니다. 약정을 그만두실 때 이곳으로 알려 드립니다.",
  FAMILY: "떠나신 뒤에 남기신 말씀을 받으실 분입니다.",
};

const KINDS: RecipientKind[] = ["ORG", "FAMILY"];

/** 화면 표시용 가림. 오타를 잡을 만큼은 남기고, 어깨너머로 읽히지는 않게 한다 */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const head = local.slice(0, 2);
  const tail = local.length > 2 ? "*".repeat(Math.min(local.length - 2, 6)) : "";
  return `${head}${tail}@${domain}`;
}

export function RecipientBook() {
  const [rows, setRows] = useState<Recipient[]>([]);
  const [kind, setKind] = useState<RecipientKind>("ORG");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relation, setRelation] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);

  const load = useCallback(async () => {
    const body = await fetch("/api/recipients").then((r) => r.json()).catch(() => null);
    if (body?.ok) setRows(body.data.recipients);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    setBusy(true);
    setError(null);
    const body = await fetch("/api/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        name: name.trim(),
        email: email.trim(),
        // 사람일 때만 관계를 받는다 — 기관에 "장녀"를 적을 자리는 없다
        relation: kind === "ORG" ? null : relation.trim() || null,
      }),
    }).then((r) => r.json());
    setBusy(false);
    if (!body.ok) return setError(body.error);
    setRows(body.data.recipients);
    setName("");
    setEmail("");
    setRelation("");
  }

  async function remove(id: string) {
    setError(null);
    const body = await fetch(`/api/recipients?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).then((r) => r.json());
    if (!body.ok) return setError(body.error);
    setRows(body.data.recipients);
  }

  return (
    <section className="space-y-3">
      <SectionHeading
        title="알릴 분"
        help={
          <>
            무언가를 알려 드려야 할 때 쓰는 주소록입니다. 약정을 그만두시면
            <strong> 받으실 곳</strong>에 통지가 나가고, 떠나신 뒤에 남기신 말씀은
            <strong> 유족</strong>께 전해집니다.
            <br />
            여기 적으신 주소는 알려 드릴 일이 있을 때만 쓰고, 보내기 전에 반드시 한 번 더
            여쭙니다.
          </>
        }
      />
      <p className="text-sm text-stone-500">
        약정을 맺거나 그만두실 때, 그리고 남기신 말씀을 전할 때 이곳의 주소를 씁니다.
      </p>

      {KINDS.map((k) => {
        const mine = rows.filter((r) => r.kind === k);
        return (
          <div key={k} className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-stone-900">{KIND_LABEL[k]}</p>
            <p className="mt-0.5 text-sm text-stone-500">{KIND_HINT[k]}</p>

            <ul className="mt-3 space-y-2">
              {mine.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-stone-800">
                      {r.name}
                      {r.relation ? (
                        <span className="ml-1 text-sm text-stone-500">({r.relation})</span>
                      ) : null}
                    </p>
                    {/* 가려서 보여준다 — 전체는 보내기 직전 확인 화면에서만 */}
                    <p className="truncate text-sm text-stone-500">{maskEmail(r.email)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(r.id)}
                    className="min-h-11 shrink-0 rounded-xl border border-stone-300 px-3 text-sm text-stone-600 transition hover:bg-stone-100"
                  >
                    지우기
                  </button>
                </li>
              ))}
              {loaded && mine.length === 0 && (
                // "0명"이라고 쓰지 않는다 — 빈칸을 사실처럼 읽게 된다
                <li className="text-sm text-stone-500">아직 적어 두신 분이 없습니다.</li>
              )}
            </ul>
          </div>
        );
      })}

      <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as RecipientKind)}
            aria-label="어떤 분인가요"
            className="min-h-11 rounded-xl border border-stone-300 bg-white px-2 text-sm"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "ORG" ? "예: 부산 지역아동센터" : "예: 김가상"}
            aria-label="이름"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-500"
          />
          {kind !== "ORG" && (
            <input
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              placeholder="관계 (예: 장녀)"
              aria-label="관계"
              className="min-h-11 w-32 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-500"
            />
          )}
        </div>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="이메일 주소"
          aria-label="이메일 주소"
          className="min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-500"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || !name.trim() || !email.trim()}
          className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
        >
          {busy ? "저장 중…" : "추가하기"}
        </button>
        {error && (
          <p className="text-sm text-stone-600">
            {error.message} {error.nextAction}
          </p>
        )}
      </div>

      {/* 제3자의 주소를 우리가 보관한다는 사실을 사용자가 알아야 한다 (개인정보보호법 §15).
          본인 동의를 받을 수 없는 자리라, 최소한 무엇에 쓰는지를 밝힌다 */}
      <p className="text-sm text-stone-500">
        적어 주신 주소는 알려 드릴 일이 있을 때만 씁니다. 그때마다 보내기 전에 여쭙고,
        보내지 않기로 하셔도 됩니다.
      </p>
    </section>
  );
}
