// S-CLM · 그만두기 (FR-405 · 민법 §1108①)
//
// ⚠ 소유: 화면은 FE 경로다. BE-2가 사람 승인 하에 **새 파일로만** 추가 — 병합 전 FE 리뷰.
//
// 버튼 글자가 서류마다 다르다. 취소·철회·해지·회수는 법적으로 다른 일이고, 한 말로
// 뭉개면 정기후원에 "철회"를 눌러 이미 낸 돈이 돌아오는 줄 안다.
// 판정은 lib/rules/revocation이 하고 화면은 그 말을 그대로 쓴다 (P3).
//
// 철회는 되돌릴 수 없다. 그래서 한 번에 처리하지 않고 **사유를 적는 단계**를 거친다 —
// 사유는 원장에 남는 정황이고(FR-553), 적는 동안 한 번 더 생각하게 된다.
"use client";

import { useEffect, useState } from "react";
import { revocationRule } from "@/lib/rules/revocation";
import type { DocType, Recipient } from "@/lib/contracts";

interface Row {
  draftId: string;
  /** 원장(Intent Ledger)의 subject는 draft가 아니라 **intent**다
   *  (intent_ledger_nodes.subject_id → intents.id). 철회·이력이 이 값을 쓴다 */
  intentId: string;
  docType: string;
  status: string;
}

type Phase = "IDLE" | "FORM" | "DONE";

export function RevokeCell({ row, onDone }: { row: Row; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [reason, setReason] = useState("");
  const [orgs, setOrgs] = useState<Recipient[]>([]);
  const [notifyId, setNotifyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const rule = revocationRule(row.docType as DocType);

  useEffect(() => {
    if (phase !== "FORM") return;
    // 기관 목록은 열 때 부른다 — 표의 모든 줄이 미리 부르면 같은 요청이 수십 번 나간다
    void fetch("/api/recipients?kind=ORG")
      .then((r) => r.json())
      .then((b) => setOrgs(b.ok ? b.data.recipients : []))
      .catch(() => setOrgs([]));
  }, [phase]);

  // 서명 전 문서는 철회가 아니라 취소다. 아직 효력이 생기지 않았으니 원장을 건드릴 일이 없다
  if (row.status === "DRAFT") {
    return <span className="text-sm text-stone-400">서명 전</span>;
  }

  if (rule.kind !== "REVOKE") {
    // 버튼을 주지 않되 **왜 그런지는 말한다.** 아무것도 없으면 사용자는 우리가
    // 빠뜨린 줄 안다
    return (
      <details className="text-sm">
        <summary className="cursor-pointer text-stone-500 underline underline-offset-4">
          {rule.kind === "NONE" ? "안내" : rule.label}
        </summary>
        <p className="mt-1 max-w-xs text-stone-600">{rule.note}</p>
      </details>
    );
  }

  if (phase === "DONE") {
    return <span className="text-sm text-stone-600">{msg ?? "철회했습니다."}</span>;
  }

  if (phase === "IDLE") {
    return (
      <button
        type="button"
        onClick={() => setPhase("FORM")}
        className="min-h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-700 transition hover:bg-stone-100"
      >
        {rule.label}
      </button>
    );
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/ledger/${row.intentId}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changeReason: reason.trim() }),
    }).then((r) => r.json());

    if (!res.ok) {
      setBusy(false);
      return setMsg(`${res.error.message} ${res.error.nextAction}`);
    }

    // 철회는 됐다. 통지는 **별개 단계**라, 실패해도 철회를 되돌리지 않는다
    let note = "철회했습니다.";
    if (notifyId) {
      const n = await fetch(`/api/ledger/${row.intentId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: notifyId }),
      }).then((r) => r.json());
      note = n.ok
        ? `철회했고 ${n.data.orgName}에 통지를 보냈습니다.`
        : `철회했습니다. 다만 통지는 보내지 못했습니다 — ${n.error.nextAction}`;
    }
    setBusy(false);
    setMsg(note);
    setPhase("DONE");
    onDone();
  }

  return (
    <div className="max-w-xs space-y-2">
      <p className="text-sm text-stone-600">{rule.note}</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="왜 그만두시는지 한 줄로 적어 주세요"
        aria-label="철회 사유"
        className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
      />
      <div>
        <label className="block text-sm text-stone-500" htmlFor={`notify-${row.intentId}`}>
          받으실 곳에 알리기
        </label>
        <select
          id={`notify-${row.intentId}`}
          value={notifyId}
          onChange={(e) => setNotifyId(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-2 text-sm"
        >
          <option value="">알리지 않기</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        {/* 알리지 않아도 철회는 성립한다 (서식 제2조). 그 사실을 여기서 말해야
            사용자가 "안 보내면 안 되는 건가" 하고 멈추지 않는다 */}
        <p className="mt-1 text-sm text-stone-500">
          알리지 않으셔도 철회는 이루어집니다. 다만 받으실 곳은 모르는 상태가 됩니다.
        </p>
      </div>
      {msg && <p className="text-sm text-stone-600">{msg}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !reason.trim()}
          className="min-h-11 rounded-xl bg-ink px-4 text-sm text-stone-50 disabled:bg-stone-300 disabled:text-stone-600"
        >
          {busy ? "처리 중…" : rule.label}
        </button>
        <button
          type="button"
          onClick={() => setPhase("IDLE")}
          className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-600"
        >
          아직요
        </button>
      </div>
    </div>
  );
}
