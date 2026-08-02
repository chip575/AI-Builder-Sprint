// S-ESTATE · 내 유산 — 만들기(/write)의 짝이 되는 **관리하기** 화면 (P5 · FR-402 · FR-508)
//
// ⚠ 소유: 화면은 FE 경로다. BE-1이 사람 승인 하에 새 파일로만 추가 — 병합 전 FE 리뷰.
//
// 이 화면이 없으면 서비스는 기부 깔때기로 보인다(2026-08-02 사용 피드백). 체결 순간
// 만들어지는 "6개월 뒤 재검토" 약속, 자산 목록, 뜻이 바뀐 기록 — 전부 백엔드에
// 있었지만 사용자가 볼 곳이 없었다. P5("증빙은 서명 이후에도 살아있다")의 화면이다.
//
// ⚠ 알려진 한계 (BE-2 요청서 — PR 코멘트 참조):
//   · 약정 "목록" API가 없어 약속(obligation)이 걸린 문서만 보인다
//   · GET /api/obligations/fire 는 관리 화면용이라 사용자 필터가 없다 —
//     다계정 운영 전에 사용자 범위 목록 API가 필요하다 (NFR-714)
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorNote, Shell } from "@/app/(ui)/_components/Shell";

interface Obligation {
  id: string;
  kind: "RECURRING_RENEWAL" | "WILL_REVIEW" | "RESUME_INVITE";
  subjectId: string;
  dueAt: string;
  firedAt?: string | null;
}

interface Pledge {
  draftId: string;
  status: string;
  completedAt: string | null;
}

interface Asset {
  id: string;
  category: string;
  label: string;
  estimatedValueKrw?: number | null;
}

interface LedgerNode {
  id: string;
  changeReason: string;
  materiality: string;
  createdAt?: string;
}

const KIND_LABEL: Record<Obligation["kind"], string> = {
  RECURRING_RENEWAL: "정기후원을 계속하실지 여쭙는 날",
  WILL_REVIEW: "남기신 뜻이 그대로인지 여쭙는 날",
  RESUME_INVITE: "이어쓰기 초대",
};

const CATEGORY_LABEL: Record<string, string> = {
  REAL_ESTATE: "부동산",
  FINANCIAL: "금융",
  INSURANCE: "보험",
  SECURITIES: "증권",
  DEBT: "채무",
  BELONGINGS: "물건",
  DIGITAL: "디지털",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "서명 전",
  REQUESTED: "서명 기다리는 중",
  COMPLETED: "서명 완료",
  REJECTED: "거절됨",
  CANCELED: "취소됨",
};

const dateOf = (iso: string) => iso.slice(0, 10);
const won = (n?: number | null) =>
  typeof n === "number" ? `${n.toLocaleString("ko-KR")}원` : null;

export default function EstatePage() {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [ledger, setLedger] = useState<LedgerNode[]>([]);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 자산 손입력 — 최소 필드만. 상세(수증자·이야기)는 자산 화면(M4)의 몫
  const [assetLabel, setAssetLabel] = useState("");
  const [assetCategory, setAssetCategory] = useState("FINANCIAL");
  const [assetValue, setAssetValue] = useState("");

  const load = useCallback(async () => {
    const [ob, inv] = await Promise.all([
      fetch("/api/obligations/fire").then((r) => r.json()).catch(() => null),
      fetch("/api/estate/assets").then((r) => r.json()).catch(() => null),
    ]);
    const obs: Obligation[] = ob?.ok ? ob.data.obligations : [];
    setObligations(obs);
    if (inv?.ok) setAssets(inv.data.assets ?? []);

    // 약정 상태 — 목록 API가 없어 약속에 걸린 문서로 역추적한다 (파일 머리 주석)
    const subjects = [...new Set(obs.map((o) => o.subjectId))];
    const found: Pledge[] = [];
    const nodes: LedgerNode[] = [];
    await Promise.all(
      subjects.map(async (id) => {
        const st = await fetch(`/api/sign/${id}/status`).then((r) => r.json()).catch(() => null);
        if (st?.ok) found.push({ draftId: id, status: st.data.status, completedAt: st.data.completedAt });
        const lg = await fetch(`/api/ledger/${id}`).then((r) => r.json()).catch(() => null);
        if (lg?.ok) nodes.push(...(lg.data.nodes ?? []));
      }),
    );
    setPledges(found);
    setLedger(nodes);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 시간 압축 (NFR-707) — 실제 스케줄러·상태머신을 그대로 통과시키는 데모 장치 */
  async function advance() {
    setBusy(true);
    setError(null);
    const body = await fetch("/api/dev/advance-time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ months: 6 }),
    }).then((r) => r.json());
    setBusy(false);
    if (!body.ok) return setError(body.error);
    await load();
  }

  async function addAsset() {
    const label = assetLabel.trim();
    if (!label) return;
    setBusy(true);
    setError(null);
    const value = Number(assetValue.replaceAll(",", ""));
    const body = await fetch("/api/estate/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: assetCategory,
        label,
        estimatedValueKrw: Number.isFinite(value) && value > 0 ? value : null,
      }),
    }).then((r) => r.json());
    setBusy(false);
    if (!body.ok) return setError(body.error);
    setAssetLabel("");
    setAssetValue("");
    await load();
  }

  const upcoming = obligations.filter((o) => !o.firedAt);
  const due = obligations.filter((o) => o.firedAt);

  return (
    <Shell
      title="내 유산"
      fr={["FR-402", "FR-508"]}
      headerBar={{
        trailing: (
          <Link
            href="/write"
            className="inline-flex min-h-11 items-center rounded-xl bg-stone-900 px-3 text-sm text-stone-50"
          >
            새 약정 준비하기
          </Link>
        ),
      }}
    >
      <div className="space-y-8">
        <p className="text-stone-500">
          남기신 것들이 시간이 지나도 관리됩니다 — 체결은 끝이 아니라 시작입니다.
        </p>

        {/* ── 다가오는 약속 (FR-508) ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold text-stone-900">다가오는 약속</h2>
            {/* 데모 장치 — 실 모드에서는 서버가 거부한다 (advance-time 라우트) */}
            <button
              type="button"
              onClick={() => void advance()}
              disabled={busy}
              className="min-h-11 rounded-xl border border-stone-300 px-3 text-xs text-stone-500 hover:bg-stone-100 disabled:text-stone-300"
            >
              {busy ? "당기는 중…" : "시간을 6개월 당겨보기"}
            </button>
          </div>
          {due.map((o) => (
            <div key={o.id} className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-stone-800">{KIND_LABEL[o.kind]}</p>
              <p className="mt-1 text-sm text-stone-500">
                {dateOf(o.dueAt)} 예정이었고, 이제 여쭐 때가 되었습니다.
              </p>
            </div>
          ))}
          {upcoming.map((o) => (
            <div key={o.id} className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="text-stone-800">{KIND_LABEL[o.kind]}</p>
              <p className="mt-1 text-sm text-stone-500">{dateOf(o.dueAt)}</p>
            </div>
          ))}
          {loaded && obligations.length === 0 && (
            <p className="text-sm text-stone-400">
              아직 예정된 약속이 없습니다. 약정을 맺으면 되짚을 날이 여기에 생깁니다.
            </p>
          )}
        </section>

        {/* ── 남긴 약정 ── */}
        <section className="space-y-3">
          <h2 className="font-serif text-lg font-semibold text-stone-900">남긴 약정</h2>
          {pledges.map((p) => (
            <div
              key={p.draftId}
              className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4"
            >
              <div>
                <p className="text-stone-800">{STATUS_LABEL[p.status] ?? p.status}</p>
                {p.completedAt && (
                  <p className="mt-1 text-sm text-stone-500">{dateOf(p.completedAt)} 체결</p>
                )}
              </div>
              <div className="flex gap-2 text-sm">
                <Link href={`/doc/${p.draftId}`} className="underline underline-offset-4">
                  문서
                </Link>
                {p.status === "COMPLETED" && (
                  <Link href={`/vault/${p.draftId}`} className="underline underline-offset-4">
                    증빙
                  </Link>
                )}
              </div>
            </div>
          ))}
          {loaded && pledges.length === 0 && (
            <p className="text-sm text-stone-400">
              아직 맺은 약정이 없습니다.{" "}
              <Link href="/write" className="underline underline-offset-4">
                작성실에서 시작
              </Link>
              하실 수 있어요.
            </p>
          )}
        </section>

        {/* ── 내 자산 (FR-402) ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold text-stone-900">내 자산</h2>
            <Link
              href="/branch/paper-scan"
              className="text-sm text-stone-500 underline underline-offset-4"
            >
              종이 문서로 등록
            </Link>
          </div>
          {assets.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4"
            >
              <div className="min-w-0">
                <p className="text-stone-800">{a.label}</p>
                <p className="mt-1 text-sm text-stone-500">
                  {CATEGORY_LABEL[a.category] ?? a.category}
                  {won(a.estimatedValueKrw) ? ` · ${won(a.estimatedValueKrw)}` : ""}
                </p>
              </div>
              {/* 자산에서 약정으로 — "무엇을 남기는가"가 대화의 출발점이 된다.
                  작성실이 이 자산을 첫 문장에 실어 유산 기부 흐름을 연다 */}
              <Link
                href={`/write?asset=${encodeURIComponent(a.label)}`}
                className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-stone-300 px-3 text-sm text-stone-700 transition hover:bg-stone-100"
              >
                이 자산 남기기
              </Link>
            </div>
          ))}
          {loaded && assets.length === 0 && (
            <p className="text-sm text-stone-400">
              아직 정리한 자산이 없습니다. 아래에서 하나씩 적어 두실 수 있어요.
            </p>
          )}
          <div className="flex flex-wrap gap-2 rounded-xl border border-stone-200 bg-white p-3">
            <select
              value={assetCategory}
              onChange={(e) => setAssetCategory(e.target.value)}
              aria-label="자산 종류"
              className="min-h-11 rounded-xl border border-stone-300 bg-white px-2 text-sm"
            >
              {Object.entries(CATEGORY_LABEL)
                .filter(([k]) => k !== "DIGITAL") // 디지털은 처리 지시가 필수 — 전용 화면(M4)의 몫
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
            <input
              value={assetLabel}
              onChange={(e) => setAssetLabel(e.target.value)}
              placeholder="예: ○○은행 예금"
              aria-label="자산 이름"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-500"
            />
            <input
              value={assetValue}
              onChange={(e) => setAssetValue(e.target.value)}
              placeholder="금액(선택)"
              aria-label="예상 금액"
              inputMode="numeric"
              className="min-h-11 w-28 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-500"
            />
            <button
              type="button"
              onClick={() => void addAsset()}
              disabled={busy || !assetLabel.trim()}
              className="min-h-11 rounded-xl bg-stone-900 px-4 text-sm text-stone-50 disabled:bg-stone-300"
            >
              적어두기
            </button>
          </div>
        </section>

        {/* ── 뜻이 바뀐 기록 (FR-553 · P5) ── */}
        <section className="space-y-3">
          <h2 className="font-serif text-lg font-semibold text-stone-900">뜻이 바뀐 기록</h2>
          {ledger.map((n) => (
            <div key={n.id} className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="text-stone-800">{n.changeReason}</p>
              <p className="mt-1 text-sm text-stone-500">
                {n.materiality === "MATERIAL" ? "재서명으로 봉인되는 변경" : "기록으로 남는 변경"}
              </p>
            </div>
          ))}
          {loaded && ledger.length === 0 && (
            <p className="text-sm text-stone-400">
              아직 바뀐 기록이 없습니다. 뜻이 바뀌면 그 과정도 서명으로 남습니다.
            </p>
          )}
        </section>

        <ErrorNote error={error} />
      </div>
    </Shell>
  );
}
