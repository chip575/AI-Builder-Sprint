// S-ESTATE · 지킴이 (FR-405 · NFR-713)
//
// ⚠ 소유: 화면은 FE 경로다. BE-2가 사람 승인 하에 **새 파일로만** 추가 — 병합 전 FE 리뷰.
//
// 지킴이는 **유언집행자가 아니다** (00.2 §7.1 · D-09). 화면에서 그렇게 부르지 않고,
// 무엇을 할 수 있는지를 범위로 보여 준다.
//
// ⚠ 초대만으로 열람이 열리지 않는다. 상대가 협조 약정서에 **서명해야** 열린다 —
//   화면이 그 상태를 분명히 보여야 사용자가 "맡겼다"고 잘못 알지 않는다.
// ⚠ 범위 기본값은 **아무것도 고르지 않은 상태**다. 미리 체크해 두면 최소 권한이 아니다.
"use client";

import { useCallback, useEffect, useState } from "react";
import type { AssetCategory, Custodian, Recipient } from "@/lib/contracts";

const CATEGORY_LABEL: Record<string, string> = {
  REAL_ESTATE: "부동산",
  FINANCIAL: "금융",
  INSURANCE: "보험",
  SECURITIES: "증권",
  DEBT: "채무",
  BELONGINGS: "물건",
  DIGITAL: "디지털",
};

const SCOPES = Object.keys(CATEGORY_LABEL) as AssetCategory[];

/** 상태를 사람 말로. "PENDING"을 그대로 보여주면 무슨 뜻인지 모른다 (NFR-705) */
const STATUS: Record<string, { label: string; note: string }> = {
  PENDING: { label: "수락 기다리는 중", note: "아직 열람하실 수 없습니다." },
  ACTIVE: { label: "열람 가능", note: "정해 주신 범위만 보실 수 있습니다." },
  REVOKED: { label: "거두었음", note: "더 이상 열람하실 수 없습니다." },
};

export function CustodianBook() {
  const [rows, setRows] = useState<Custodian[]>([]);
  const [people, setPeople] = useState<Recipient[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [scope, setScope] = useState<Set<AssetCategory>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  /** 범위를 고치는 중인 지킴이. null이면 아무도 안 고치는 중 */
  const [editing, setEditing] = useState<{ id: string; scope: Set<AssetCategory> } | null>(null);

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([
      fetch("/api/estate/custodians").then((x) => x.json()).catch(() => null),
      fetch("/api/recipients?kind=CUSTODIAN").then((x) => x.json()).catch(() => null),
    ]);
    if (c?.ok) setRows(c.data.custodians);
    if (r?.ok) setPeople(r.data.recipients);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite() {
    setBusy(true);
    setMsg(null);
    const body = await fetch("/api/estate/custodians", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientId,
        displayName: displayName.trim(),
        viewScope: [...scope],
      }),
    }).then((r) => r.json());
    setBusy(false);
    if (!body.ok) return setMsg(`${body.error.message} ${body.error.nextAction}`);
    setMsg("초대를 보냈습니다. 그분이 약정서에 서명하시면 열람이 열립니다.");
    setDisplayName("");
    setScope(new Set());
    setRecipientId("");
    void load();
  }

  /** 범위 변경은 재서명이다 — 무엇이 일어나는지 먼저 말하고 시작한다 */
  async function changeScope(id: string, current: AssetCategory[]) {
    setEditing({ id, scope: new Set(current) });
    setMsg(null);
  }

  async function submitScope() {
    if (!editing) return;
    setBusy(true);
    setMsg(null);
    const body = await fetch(`/api/estate/custodians?id=${encodeURIComponent(editing.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewScope: [...editing.scope] }),
    }).then((r) => r.json());
    setBusy(false);
    if (!body.ok) return setMsg(`${body.error.message} ${body.error.nextAction}`);
    setEditing(null);
    setMsg("범위를 바꿨습니다. 그분이 새 약정서에 서명하시면 다시 열립니다.");
    void load();
  }

  async function revoke(id: string) {
    const body = await fetch(`/api/estate/custodians?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).then((r) => r.json());
    if (!body.ok) return setMsg(`${body.error.message} ${body.error.nextAction}`);
    setRows(body.data.custodians);
  }

  const nameOf = (rid: string) => people.find((p) => p.id === rid)?.name ?? "";

  return (
    <section className="space-y-3">
      <h2 className="font-serif text-lg font-semibold text-stone-900">지킴이</h2>
      <p className="text-sm text-stone-500">
        정해 주신 범위만 열람하실 수 있는 분입니다. 유언을 집행하는 분은 아닙니다.
      </p>

      {rows.map((c) => {
        const st = STATUS[c.status] ?? STATUS.PENDING!;
        return (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4"
          >
            <div className="min-w-0">
              <p className="text-stone-800">
                {c.displayName}
                {nameOf(c.recipientId) && (
                  <span className="ml-1 text-sm text-stone-500">({nameOf(c.recipientId)})</span>
                )}
              </p>
              <p className="mt-1 text-sm text-stone-500">
                {st.label} · {st.note}
              </p>
              <p className="mt-1 text-sm text-stone-500">
                {c.viewScope.length > 0
                  ? c.viewScope.map((s) => CATEGORY_LABEL[s] ?? s).join(", ")
                  : "열람 범위 없음"}
              </p>
            </div>
            {c.status !== "REVOKED" && (
              <div className="flex shrink-0 gap-2">
                {/* 범위를 바꾸면 약정서 본문이 바뀐다 → 재서명이고, 그 사이 열람은 닫힌다
                    (NFR-713). 그래서 "조용히 고치기"가 아니라 버튼으로 분명히 둔다 */}
                <button
                  type="button"
                  onClick={() => void changeScope(c.id, c.viewScope)}
                  className="min-h-11 rounded-xl border border-stone-300 px-3 text-sm text-stone-600 transition hover:bg-stone-100"
                >
                  범위 바꾸기
                </button>
                <button
                  type="button"
                  onClick={() => void revoke(c.id)}
                  className="min-h-11 rounded-xl border border-stone-300 px-3 text-sm text-stone-600 transition hover:bg-stone-100"
                >
                  권한 회수
                </button>
              </div>
            )}
          </div>
        );
      })}

      {editing && (
        <div className="space-y-2 rounded-xl border border-stone-400 bg-white p-4">
          <p className="text-stone-900">열람 범위 바꾸기</p>
          {/* 무엇이 일어나는지 누르기 전에 말한다 — 누른 뒤에 알면 늦다 */}
          <p className="text-sm text-stone-500">
            범위를 바꾸면 약정서 내용이 달라져서 그분께 다시 확인을 받습니다. 그동안에는
            열람이 닫힙니다. 좁히실 때도 마찬가지입니다.
          </p>
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((sc) => (
              <label
                key={sc}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 px-3 text-sm text-stone-700"
              >
                <input
                  type="checkbox"
                  checked={editing.scope.has(sc)}
                  onChange={(e) =>
                    setEditing((prev) => {
                      if (!prev) return prev;
                      const next = new Set(prev.scope);
                      if (e.target.checked) next.add(sc);
                      else next.delete(sc);
                      return { ...prev, scope: next };
                    })
                  }
                />
                {CATEGORY_LABEL[sc]}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void submitScope()}
              disabled={busy}
              className="min-h-11 rounded-xl bg-ink px-4 text-sm text-stone-50 disabled:bg-stone-300 disabled:text-stone-600"
            >
              {busy ? "처리 중…" : "바꾸고 다시 확인받기"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-600"
            >
              아직요
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
        {people.length === 0 ? (
          // 왜 초대할 수 없는지 말한다. 빈 목록만 있으면 고장인 줄 안다
          <p className="text-sm text-stone-500">
            먼저 <strong>내 정보 → 알릴 분</strong>에서 지킴이로 한 분을 등록해 주세요.
          </p>
        ) : (
          <>
            <select
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              aria-label="어느 분께 맡기시겠어요"
              className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-2 text-sm"
            >
              <option value="">어느 분께 맡기시겠어요</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.relation ? ` (${p.relation})` : ""}
                </option>
              ))}
            </select>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="약정서에 인쇄될 성함"
              aria-label="약정서에 인쇄될 성함"
              className="min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-500"
            />
            <fieldset>
              <legend className="text-sm text-stone-500">보실 수 있는 범위</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {SCOPES.map((s) => (
                  <label
                    key={s}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 px-3 text-sm text-stone-700"
                  >
                    <input
                      type="checkbox"
                      checked={scope.has(s)}
                      onChange={(e) =>
                        setScope((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(s);
                          else next.delete(s);
                          return next;
                        })
                      }
                    />
                    {CATEGORY_LABEL[s]}
                  </label>
                ))}
              </div>
              {/* 아무것도 고르지 않아도 초대는 된다 — 그게 최소 권한이다.
                  나중에 범위를 넓히시면 약정서 본문이 바뀌어 다시 서명받습니다 (NFR-713) */}
              <p className="mt-1 text-sm text-stone-500">
                고르지 않으시면 아무것도 보실 수 없습니다. 나중에 넓히실 수 있고, 그때는
                약정서를 다시 확인받습니다.
              </p>
            </fieldset>
            <button
              type="button"
              onClick={() => void invite()}
              disabled={busy || !recipientId || !displayName.trim()}
              className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
            >
              {busy ? "보내는 중…" : "협조를 부탁드리기"}
            </button>
          </>
        )}
        {msg && <p className="text-sm text-stone-600">{msg}</p>}
      </div>
    </section>
  );
}
