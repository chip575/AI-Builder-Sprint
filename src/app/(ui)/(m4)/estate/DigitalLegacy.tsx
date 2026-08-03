// S-ESTATE · 디지털 유산 (FR-403)
//
// ⚠ 소유: 화면은 FE 경로다. BE-2가 사람 승인 하에 **새 파일로만** 추가 — 병합 전 FE 리뷰.
//
// 구독·클라우드·SNS를 어떻게 할지 남겨 두는 곳.
//
// ⚠ **서명하지 않는 문서다.** 플랫폼은 우리 서류를 근거로 계정을 지워 주지 않는다 —
//   남은 사람이 참고할 지시이지 집행력이 있는 서류가 아니다. 화면이 그 말을 먼저 한다.
//   여기에 "서명하기"를 붙이면 그 순간 이 문서가 무엇인지 흐려진다 (절대규칙 4의 정신).
// ⚠ 처리 방식을 안 정한 것과 정한 것을 **한 목록에 섞지 않는다.** 남은 사람이
//   무엇을 해야 할지 모르게 된다.
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Asset, Beneficiary, DigitalDisposition } from "@/lib/contracts";
import { SectionHeading } from "@/app/(ui)/_components/HelpTip";

/** 화면이 다루는 것은 디지털 자산뿐이다 — 계약의 판별 유니온에서 그 갈래만 좁혀 쓴다 */
type DigitalAssetRow = Extract<Asset, { category: "DIGITAL" }>;

type Action = "DELETE" | "PRESERVE" | "TRANSFER";

const ACTION_LABEL: Record<Action, string> = {
  DELETE: "지워 주세요",
  PRESERVE: "그대로 두세요",
  TRANSFER: "이분께 넘겨 주세요",
};

export function DigitalLegacy({ onChanged }: { onChanged?: () => void }) {
  const [assets, setAssets] = useState<DigitalAssetRow[]>([]);
  const [people, setPeople] = useState<Beneficiary[]>([]);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [inv, doc] = await Promise.all([
      fetch("/api/estate/assets").then((r) => r.json()).catch(() => null),
      fetch("/api/estate/digital-legacy").then((r) => r.json()).catch(() => null),
    ]);
    if (inv?.ok) {
      setAssets(
        (inv.data.assets ?? []).filter(
          (a: Asset): a is DigitalAssetRow => a.category === "DIGITAL",
        ),
      );
      setPeople(inv.data.beneficiaries ?? []);
    }
    if (doc?.ok) setDocumentId(doc.data.documentId);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setDisposition(assetId: string, action: Action, toBeneficiaryId?: string) {
    setBusy(true);
    setMsg(null);
    const disposition =
      action === "TRANSFER" ? { action, toBeneficiaryId } : { action };
    const body = await fetch(`/api/estate/assets?id=${encodeURIComponent(assetId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disposition }),
    }).then((r) => r.json());
    setBusy(false);
    if (!body.ok) return setMsg(`${body.error.message} ${body.error.nextAction}`);
    await load();
    onChanged?.();
  }

  async function saveDocument() {
    setBusy(true);
    setMsg(null);
    const body = await fetch("/api/estate/digital-legacy", { method: "POST" }).then((r) => r.json());
    setBusy(false);
    if (!body.ok) return setMsg(`${body.error.message} ${body.error.nextAction}`);
    setDocumentId(body.data.documentId);
    setMsg("서류 이력에 넣었습니다. 정하신 내용이 바뀌면 그대로 반영됩니다.");
    onChanged?.();
  }

  // 디지털 자산이 아예 없으면 이 자리를 그리지 않는다 — 빈 상자는 할 일이 있는 것처럼 보인다
  if (assets.length === 0) return null;

  const decided = assets.filter((a) => a.disposition);
  const undecided = assets.filter((a) => !a.disposition);

  return (
    <section className="space-y-3">
      <SectionHeading
        title="디지털 유산"
        help={
          <>
            구독·클라우드·SNS 같은 계정을 어떻게 할지 남겨 두는 곳입니다.
            <br />
            <strong>법적 효력이 있는 서류가 아닙니다.</strong> 서비스 회사가 이 문서만으로
            계정을 지워 주지는 않습니다 — 남은 분들이 “무엇을 원하셨는지” 알 수 있게 하는
            기록입니다. 그래서 서명란도 없습니다.
            <br />
            <strong>쓰는 법</strong> — 계정마다 지울지, 남길지, 누구에게 넘길지를 고르시면 됩니다. 넘기실 분은 마이페이지 주소록에서 옵니다.
          </>
        }
      />

      {undecided.length > 0 && (
        <div className="rounded-xl border border-stone-300 bg-white p-4">
          <p className="text-stone-900">아직 정하지 않으신 것 {undecided.length}개</p>
          <ul className="mt-3 space-y-4">
            {undecided.map((a) => (
              <li key={a.id}>
                <p className="text-stone-800">{a.label}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(["DELETE", "PRESERVE"] as const).map((act) => (
                    <button
                      key={act}
                      type="button"
                      disabled={busy}
                      onClick={() => void setDisposition(a.id, act)}
                      className="min-h-11 rounded-xl border border-stone-300 px-3 text-sm text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
                    >
                      {ACTION_LABEL[act]}
                    </button>
                  ))}
                  {/* 이전은 받을 분 없이 성립하지 않는다 (계약이 강제한다).
                      그래서 사람이 없으면 이 선택지를 아예 내놓지 않는다 */}
                  {people.length > 0 && (
                    <select
                      defaultValue=""
                      disabled={busy}
                      aria-label={`${a.label} 넘겨받으실 분`}
                      onChange={(e) =>
                        e.target.value && void setDisposition(a.id, "TRANSFER", e.target.value)
                      }
                      className="min-h-11 rounded-xl border border-stone-300 bg-white px-2 text-sm"
                    >
                      <option value="">이분께 넘겨 주세요…</option>
                      {people.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.relation})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {decided.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-stone-900">정해 두신 것</p>
          <ul className="mt-2 space-y-1">
            {decided.map((a) => {
              const d = a.disposition as DigitalDisposition;
              const who =
                d.action === "TRANSFER"
                  ? (people.find((b) => b.id === d.toBeneficiaryId)?.name ?? "받으실 분")
                  : null;
              return (
                <li key={a.id} className="text-sm text-stone-700">
                  {a.label} — {who ? `${who}께 넘김` : ACTION_LABEL[d.action]}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => void saveDocument()}
            disabled={busy}
            className="mt-3 min-h-11 w-full rounded-xl border border-stone-300 px-4 text-sm text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
          >
            {busy ? "저장 중…" : documentId ? "서류 이력 갱신하기" : "서류 이력에 넣기"}
          </button>
        </div>
      )}

      {msg && <p className="text-sm text-stone-600">{msg}</p>}
    </section>
  );
}
