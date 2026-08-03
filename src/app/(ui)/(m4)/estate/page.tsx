// S-ESTATE · 내 유산 — 만들기(/write)의 짝이 되는 **관리하기** 화면 (P5 · FR-402 · FR-508)
//
// ⚠ 소유: 화면은 FE 경로다. BE-1이 사람 승인 하에 새 파일로만 추가 — 병합 전 FE 리뷰.
//
// 이 화면이 없으면 서비스는 기부 깔때기로 보인다(2026-08-02 사용 피드백). 체결 순간
// 만들어지는 "6개월 뒤 재검토" 약속, 자산 목록, 뜻이 바뀐 기록 — 전부 백엔드에
// 있었지만 사용자가 볼 곳이 없었다. P5("증빙은 서명 이후에도 살아있다")의 화면이다.
//
// ⚠ 알려진 한계 (BE-2 요청서 — PR 코멘트 참조):
//   · GET /api/obligations/fire 는 관리 화면용이라 **사용자 필터가 없다** —
//     다계정 운영 전에 사용자 범위 목록 API가 필요하다 (NFR-714). 지금 이 화면에서
//     약속 목록만 그 API를 쓴다 (약정 목록은 /api/clm/documents로 옮겼다)
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorNote, Shell } from "@/app/(ui)/_components/Shell";
import { SectionHeading } from "@/app/(ui)/_components/HelpTip";
import { ScrollList } from "@/app/(ui)/_components/ScrollList";
import { SECTION_PANEL, SECTION_STACK } from "@/app/(ui)/_components/section";
import { AssetStatus } from "./AssetStatus";
import { DigitalLegacy } from "./DigitalLegacy";
import type { InventorySummary } from "@/lib/contracts";

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
  // 서버가 내려주는 집계. **화면이 다시 세지 않는다** — 세면 대화가 말하는 값과 갈라진다
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [ledger, setLedger] = useState<LedgerNode[]>([]);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 자산 손입력 — 최소 필드만. 상세(수증자·이야기)는 자산 화면(M4)의 몫
  /** 회상 세션 — /recall이 남긴 것. 없으면 마음 유언으로 가는 길을 열지 않는다.
   *  sessionId 없이 /heartwill을 열면 "대화 번호를 손으로 입력하세요"가 되기 때문이다.
   *  서버에 세션 조회 API가 없어 브라우저에 남은 id가 유일한 단서다 (BE 계약 요청 중) */
  const [recallSessionId, setRecallSessionId] = useState<string | null>(null);
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
    if (inv?.ok) {
      setAssets(inv.data.assets ?? []);
      setSummary(inv.data.summary ?? null);
    }

    // 약정 목록은 **문서 목록 API**에서 온다.
    // 예전에는 약속(obligation)에 걸린 문서로 역추적했는데 두 가지가 틀렸다:
    //   ① 약속이 없는 약정은 아예 안 보였다 (파일 머리의 "알려진 한계")
    //   ② obligation.subjectId는 **draftId**인데 /api/ledger는 **intentId**를 받는다
    //      (intent_ledger_nodes.subject_id → intents.id). 그래서 이력이 늘 비어 있었고,
    //      .catch(() => null)이 그 사실까지 삼켰다 (2026-08-03 실측)
    const docs = await fetch("/api/clm/documents").then((r) => r.json()).catch(() => null);
    const rows: { draftId: string; intentId: string; status: string; createdAt: string }[] =
      docs?.ok ? docs.data.documents : [];
    setPledges(
      rows.map((d) => ({ draftId: d.draftId, status: d.status, completedAt: null })),
    );

    // 이력은 intent 단위다. 한 intent에 문서가 여럿이면 이력은 하나뿐이라 중복 조회를 뺀다
    const intents = [...new Set(rows.map((d) => d.intentId))];
    const nodes: LedgerNode[] = [];
    await Promise.all(
      intents.map(async (id) => {
        const lg = await fetch(`/api/ledger/${id}`).then((r) => r.json()).catch(() => null);
        if (lg?.ok) nodes.push(...(lg.data.nodes ?? []));
      }),
    );
    setLedger(nodes);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setRecallSessionId(localStorage.getItem("namgida.recallSessionId"));
  }, []);

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
        // 이 화면의 다음 걸음은 "새 약정"이다 — 서랍을 열지 않아도 닿게 둔다
        trailing: (
          <Link
            href="/write"
            className="inline-flex min-h-11 items-center rounded-xl bg-ink px-3 text-sm text-stone-50"
          >
            새 약정 준비하기
          </Link>
        ),
      }}
      bottomBar={
        // 곁칸이 열려도 그만두는 문이 덮이지 않게 Shell이 바에 z-50을 건다.
        // headerBar만 쓰면 Shell의 고정 버튼이 본문을 가린다 (P4)
        <div className="flex justify-end">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-stone-500 transition hover:bg-stone-100 hover:text-stone-700"
          >
            나중에 생각할래요
          </Link>
        </div>
      }
    >
      {/* 구획을 **선이 아니라 면으로** 가른다.
          가로줄을 그으면 서류처럼 보인다 — 이 서비스는 서류를 다루지만 서류처럼 보일
          이유는 없다. 바탕이 stone-50(따뜻한 미색)이라 구획을 흰 기 도는 패널로 살짝
          띄우면, 안쪽 흰 카드가 한 겹 더 밝게 얹혀 층이 생긴다.
          테두리는 stone-200/70 — 있는 줄 알아볼 만큼만 두고 시선을 끌지 않는다. */}
      <div className={SECTION_STACK}>
        {/* 두 문장을 각 줄에 둔다 — 대시로 이으면 좁은 화면에서 한 줄이 너무 길어진다 */}
        <p className="text-stone-500">
          남기신 것들이 시간이 지나도 관리됩니다.
          <br />
          체결은 끝이 아니라 시작입니다.
        </p>

        {/* ── 남기신 마음 (FR-111 · FR-301) ──
            법적 서류가 아니다. 그래서 아래 약정 카드들과 같은 상자를 쓰되 도장·상태
            같은 서류 표시를 두지 않는다. 세지도 않는다 — 회상은 진도가 아니다 (P4·FR-111) */}
        <section className={SECTION_PANEL}>
          <SectionHeading
            title="남기신 마음"
            help={
              <>
                법적 효력이 있는 서류와는 별개로, 하고 싶은 말씀을 그대로 남겨 두는 자리입니다.
            재산을 옮기거나 유언의 효력을 갖지 않습니다 — 그래서 서명하지 않고 보관만 합니다.
            법적 효력이 필요한 유언장은 손으로 직접 쓰셔야 합니다 (민법 제1066조).
              </>
            }
          />
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="leading-relaxed text-stone-700">
              법적 효력이 있는 서류와는 별개로, 하고 싶은 말씀을 그대로 남겨 두는
              자리입니다. 언제든 시작하셔도 되고, 하지 않으셔도 괜찮습니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/recall"
                className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
              >
                천천히 회상하며 이야기 남기기
              </Link>
              {/* 남긴 이야기가 있을 때만 문을 연다 */}
              {recallSessionId && (
                <Link
                  href={`/heartwill?sessionId=${recallSessionId}`}
                  className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm text-stone-600 underline underline-offset-4 transition hover:bg-stone-100 hover:text-stone-800"
                >
                  남기신 마음 유언 보기
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* ── 다가오는 약속 (FR-508) ── */}
        <section className={SECTION_PANEL}>
          <div className="flex items-center justify-between">
            <SectionHeading
            title="다가오는 약속"
            help={
              <>
                서류를 맺으면 “언제 다시 여쭐지”가 함께 정해집니다. 정기후원은 계속하실지,
            남기신 뜻은 그대로인지 — 그날이 오면 이곳에 뜹니다.
            체결이 끝이 아니라 시작이라는 뜻이고, 재촉이 아니라 초대입니다.
              </>
            }
          />
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
          {/* 기한 도래는 경고가 아니라 "이제 여쭐 때가 됐다"는 안내다.
              amber는 Notice(법적 고지), rose는 ErrorNote가 이미 쓰고 있어 신호가 겹친다 —
              sky로 두면 흰 카드(아직 안 된 것)와도, 경고·오류와도 구분된다 */}
          {/* 여쭐 때가 된 것은 굴림 밖에 둔다 — 지금 할 일이라 접히면 안 된다 */}
          {due.map((o) => (
            <div key={o.id} className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-stone-800">{KIND_LABEL[o.kind]}</p>
              <p className="mt-1 text-sm text-stone-600">
                {dateOf(o.dueAt)} 예정이었고, 이제 여쭐 때가 되었습니다.
              </p>
            </div>
          ))}
          <ScrollList count={upcoming.length}>
            {upcoming.map((o) => (
              <div key={o.id} className="rounded-xl border border-stone-200 bg-white p-4">
                <p className="text-stone-800">{KIND_LABEL[o.kind]}</p>
                <p className="mt-1 text-sm text-stone-500">{dateOf(o.dueAt)}</p>
              </div>
            ))}
          </ScrollList>
          {loaded && obligations.length === 0 && (
            <p className="text-sm text-stone-500">
              아직 예정된 약속이 없습니다. 약정을 맺으면 되짚을 날이 여기에 생깁니다.
            </p>
          )}
        </section>

        {/* ── 남긴 약정 ── */}
        <section className={SECTION_PANEL}>
          <SectionHeading
            title="남긴 약정"
            help={
              <>
                서명까지 끝난 서류와 진행 중인 서류를 함께 보여드립니다.
            자세한 내용과 그만두기는 <strong>서류 이력</strong> 화면에서 하실 수 있습니다.
              </>
            }
          />
          <ScrollList count={pledges.length}>
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
          </ScrollList>
          {loaded && pledges.length === 0 && (
            <p className="text-sm text-stone-500">
              아직 맺은 약정이 없습니다.{" "}
              <Link href="/write" className="underline underline-offset-4">
                작성실에서 시작
              </Link>
              하실 수 있어요.
            </p>
          )}
        </section>

        {/* ── 디지털 유산 (FR-403) ── */}
        <DigitalLegacy onChanged={() => void load()} />

        {/* ── 내 자산 (FR-402) ── */}
        <section className={SECTION_PANEL}>
          {/* "종이 문서로 등록"은 서류 서랍으로 옮겼다 — 여기서는 밑줄 링크라
              터치 영역이 44px에 못 미쳤고, 서류로 가는 문은 한곳에 모으는 편이 낫다 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeading
            title="내 자산"
            help={
              <>
                저희가 아는 재산은 <strong>직접 적어 주신 것</strong>뿐입니다. 그래서 여기 있는 것이
            전부가 아닐 수 있고, 화면도 그렇게 말합니다 — “확인한 자산”이라고 쓰는 이유입니다.
            금액을 적지 않으신 항목이 섞이면 합계를 내지 않습니다.
              </>
            }
          />
            {/* 점검은 **접어 둔다.** 펴 두면 화면을 열 때마다 총액이 먼저 눈에 들어오고,
                이 화면은 관리하러 오는 곳이지 재산을 확인하러 오는 곳이 아니다.
                누른 사람에게만 보이는 편이 P4(재촉하지 않는다)와도 맞는다 */}
            <button
              type="button"
              onClick={() => setStatusOpen((v) => !v)}
              aria-expanded={statusOpen}
              aria-controls="asset-status"
              className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-700 transition hover:bg-stone-100"
            >
              자산 상태 점검
            </button>
          </div>

          {/* 닫혀 있어도 DOM에 남긴다 — 버튼의 aria-controls가 가리킬 대상이 있어야 한다 */}
          <div id="asset-status" hidden={!statusOpen}>
            {summary ? (
              <AssetStatus summary={summary} />
            ) : (
              <p className="text-sm text-stone-500">
                {loaded
                  ? "지금은 자산 현황을 불러오지 못했습니다. 잠시 뒤 다시 열어 봐 주세요."
                  : "불러오는 중…"}
              </p>
            )}
          </div>

          <ScrollList count={assets.length}>
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
          </ScrollList>
          {loaded && assets.length === 0 && (
            <p className="text-sm text-stone-500">
              아직 정리한 자산이 없습니다. 아래에서 하나씩 적어 두실 수 있어요.
            </p>
          )}
          {/* 좁은 화면에서는 세로로 쌓는다 — 넷을 한 줄에 두면 375px에서 이름 칸이
              "부산은행 정기예금"도 못 담을 만큼 좁아진다 (P2). sm부터 한 줄로 돌아온다 */}
          <div className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center">
            <select
              value={assetCategory}
              onChange={(e) => setAssetCategory(e.target.value)}
              aria-label="자산 종류"
              className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-2 text-sm sm:w-auto"
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
              className="min-h-11 w-full min-w-0 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-500 sm:flex-1"
            />
            <input
              value={assetValue}
              onChange={(e) => setAssetValue(e.target.value)}
              placeholder="금액(선택)"
              aria-label="예상 금액"
              inputMode="numeric"
              className="min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-500 sm:w-28"
            />
            <button
              type="button"
              onClick={() => void addAsset()}
              disabled={busy || !assetLabel.trim()}
              className="min-h-11 w-full rounded-xl bg-ink px-4 text-sm text-stone-50 disabled:bg-stone-300 disabled:text-stone-600 sm:w-auto"
            >
              적어두기
            </button>
          </div>
        </section>

        {/* ── 뜻이 바뀐 기록 (FR-553 · P5) ── */}
        <section className={SECTION_PANEL}>
          <SectionHeading
            title="뜻이 바뀐 기록"
            help={
              <>
                마음이 바뀌신 과정을 시간 순서로 남깁니다. 각 기록은 앞의 기록과 사슬처럼
            묶여 있어서, 한 글자만 바뀌어도 그 뒤가 전부 어긋납니다 —
            나중에 “이게 정말 본인 뜻이었나”를 물었을 때 답이 되는 자리입니다.
              </>
            }
          />
          <ScrollList count={ledger.length}>
  {ledger.map((n) => (
              <div key={n.id} className="rounded-xl border border-stone-200 bg-white p-4">
                <p className="text-stone-800">{n.changeReason}</p>
                <p className="mt-1 text-sm text-stone-500">
                  {n.materiality === "MATERIAL" ? "재서명으로 봉인되는 변경" : "기록으로 남는 변경"}
                </p>
              </div>
            ))}
          </ScrollList>
          {loaded && ledger.length === 0 && (
            <p className="text-sm text-stone-500">
              아직 바뀐 기록이 없습니다. 뜻이 바뀌면 그 과정도 서명으로 남습니다.
            </p>
          )}
        </section>

        <ErrorNote error={error} />
      </div>
    </Shell>
  );
}
