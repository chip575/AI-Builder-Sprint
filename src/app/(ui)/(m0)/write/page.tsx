// S-WRITE · 서류 작성실 — 문서가 주인공인 메인 흐름 (FR-101 · FR-115B · FR-501 전 단계)
//
// ⚠ 소유: 화면은 FE 경로다. BE-1이 **새 파일로만** 추가한 초안 — 기존 FE 파일 무수정.
//   랜딩에서 이 화면으로 들어오는 문은 FE가 단다. Shell을 쓰는 것은 선택이 아니다 —
//   shell.test.ts가 전 화면의 나가는 길(P4)을 Shell로 강제한다.
//
// 흐름: 문서를 고르면(=명시적 의사, Express 직접 진입 FR-115B) Solar와의 대화가
// 열리고, 말한 내용이 아래 약정서 미리보기의 빈칸을 채운다.
//   · 무거운 가지(유산 기부)는 숙려를 거친다 — 오늘 할지, 다음에 할지 (P4)
//   · 유언장 카드에는 **서명 버튼이 없다** — 게이트 사실을 문 앞에서 말한다 (절대 규칙 4)
//   · 확정은 기존 /confirm 하나뿐이다 — 새 확정 경로를 만들지 않는다 (P1)
//   · 서명은 확정 뒤 기존 /doc(모두싸인)이 맡는다
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { postSse } from "@/lib/sse";
import { ErrorNote, Shell } from "@/app/(ui)/_components/Shell";
import { STATUTES } from "@/lib/rules/validity-gate";
import { DocPreview, type PreviewFacts } from "./DocPreview";

interface Turn {
  role: "user" | "assistant";
  text: string;
}

type SignableDoc =
  | "LEGACY_GIFT_AGREEMENT"
  | "DONATION_PLEDGE"
  | "HERITAGE_SUPPORT_PLEDGE";

/** 문서 선택 → 파이프라인 진입 발화. 카드 클릭이 곧 이 문장이다 (Express 직접 진입) */
const DOC_ENTRY: Record<SignableDoc, { title: string; desc: string; utterance: string }> = {
  LEGACY_GIFT_AGREEMENT: {
    title: "유산 기부 약정서",
    desc: "세상을 떠난 뒤 재산 일부를 남기는 약정 — 생전에 계약으로 맺고, 효력은 사망 시에 생깁니다.",
    // ⚠ "유산을 기부…"로 쓰면 안 된다 — express 규칙의 target이 `유산\s*기부`라
    //   조사(을)가 끼면 LEGACY를 놓치고 DONATION_NOW로 떨어진다 (2026-08-01 실측).
    //   규칙(lib/rules)은 보호 경로이므로 발화 쪽을 패턴에 맞춘다.
    utterance: "유산 기부를 하고 싶어요",
  },
  DONATION_PLEDGE: {
    title: "기부 약정서",
    desc: "지금 마음이 향하는 곳에 보태는 약정 — 지역과 금액을 정해 바로 체결합니다.",
    utterance: "고향에 기부하고 싶어요",
  },
  HERITAGE_SUPPORT_PLEDGE: {
    title: "문화유산 후원 약정서",
    desc: "지키고 싶은 문화유산에 보태는 약정 — 후원 대상과 금액을 정해 체결합니다.",
    utterance: "문화유산을 후원하고 싶어요",
  },
};

/** 선택 화면의 묶음 — 남기는 방식으로 나눈다. 트랙 강요가 아니라 문서 진열이다.
 *  자산 지킴이 약정(CUSTODIAN)은 진열에서 뺐다(2026-08-02 결정) — 배선은 남아 있어
 *  자산 정리 흐름(M4)이 자라면 그쪽에서 다시 건다 */
const DOC_GROUPS: { heading: string; docs: SignableDoc[] }[] = [
  { heading: "지금 남기기", docs: ["DONATION_PLEDGE", "HERITAGE_SUPPORT_PLEDGE"] },
  { heading: "사후에 남기기", docs: ["LEGACY_GIFT_AGREEMENT"] },
];

/** 세션 키 — 작성실 전용. 회상(/chat)·안내(/guide) 대화를 덮지 않는다 (보안 1조: id만) */
const SESSION_KEY = "namgida.writeSessionId";
const DOC_KEY = "namgida.writeDocType";

/**
 * useSearchParams는 정적 프리렌더에서 Suspense 경계를 요구한다 — 없으면 dev는 멀쩡한데
 * `next build`가 /write에서 죽는다 (Vercel 배포 실패로 발견, 2026-08-02).
 * 그래서 본체를 감싸는 껍데기가 기본 내보내기다.
 */
export default function WritePage() {
  return (
    <Suspense fallback={null}>
      <WriteWorkspace />
    </Suspense>
  );
}

function WriteWorkspace() {
  const router = useRouter();
  /** 내 유산에서 넘어온 자산 — "무엇을 남기는가"가 대화의 첫 문장에 실린다 */
  const assetParam = useSearchParams().get("asset");
  const [docType, setDocType] = useState<SignableDoc | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);
  const [facts, setFacts] = useState<PreviewFacts>({});
  /** 무거운 가지의 숙려 — 서버가 재확인을 요구하면 여기 제안 id가 담긴다 (FR-115B) */
  const [deliberation, setDeliberation] = useState<string | null>(null);
  /** 대화와 문서는 같은 화면을 나눠 쓰지 않는다 — 미리보기가 말풍선 사이에 끼면 거슬린다 */
  const [view, setView] = useState<"chat" | "doc">("chat");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  // 자산에서 온 진입은 이어쓰기보다 우선한다 — "이 자산 남기기"를 눌렀다는 것이
  // 지금의 의사다. StrictMode 이중 실행이 세션을 두 개 만들지 않게 ref로 잠근다
  const startedFromAsset = useRef(false);

  // 이어쓰기 — 지난 작성이 있으면 그 문서·세션으로 돌아온다 (D-07)
  useEffect(() => {
    if (assetParam) {
      if (startedFromAsset.current) return;
      startedFromAsset.current = true;
      void pick(
        "LEGACY_GIFT_AGREEMENT",
        `유산 기부를 하고 싶어요. ${assetParam}을(를) 남기고 싶습니다.`,
      );
      return;
    }
    const savedSession = localStorage.getItem(SESSION_KEY);
    const savedDoc = localStorage.getItem(DOC_KEY) as SignableDoc | null;
    if (savedSession && savedDoc && DOC_ENTRY[savedDoc]) {
      setSessionId(savedSession);
      setDocType(savedDoc);
      void refreshFacts(savedSession);
      // 대화 원문 복원은 세션 조회 계약이 없어 아직 못 한다(브라우저 저장은 보안 1조 금지,
      // 조회 API 신설은 PM 계약 몫). 빈 화면 대신 이어쓰기라는 사실과 갈 곳을 말해 준다
      setTurns([
        {
          role: "assistant",
          text:
            "지난 작성을 이어갑니다. 지금까지 정리된 값은 아래 현황과 약정서에서 " +
            "보실 수 있어요. 이어서 말씀해 주세요.",
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회 진입 판정
  }, []);

  async function refreshFacts(sid: string) {
    const body = await fetch(`/api/facts?intentId=${sid}`).then((r) => r.json()).catch(() => null);
    if (!body?.ok) return;
    const next: PreviewFacts = {};
    for (const f of body.data.facts ?? []) {
      if (f.key === "amount" && typeof f.value === "number") next.amount = f.value;
      if (f.key === "region" && typeof f.value === "string") next.region = f.value;
      if (f.key === "orgName" && typeof f.value === "string") next.orgName = f.value;
    }
    setFacts(next);
  }

  /** 대화 한 턴 — 스트림과 meta(Express 제안 id)를 함께 받는다 */
  async function send(raw?: string, opts?: { forSession?: string | null }) {
    const text = (raw ?? input).trim();
    if (!text || busy) return null;
    setInput("");
    setError(null);
    setBusy(true);
    setView("chat"); // 말을 보내면 대화로 돌아온다 — 답이 문서 뒤에 숨지 않게
    setTurns((t) => [...t, { role: "user", text }, { role: "assistant", text: "" }]);

    let expressProposalId: string | null = null;
    try {
      await postSse(
        "/api/session/message",
        { sessionId: opts?.forSession !== undefined ? opts.forSession : sessionId, text },
        {
          onToken: (chunk) =>
            setTurns((t) => {
              const next = [...t];
              const last = next[next.length - 1]!;
              next[next.length - 1] = { ...last, text: last.text + chunk };
              return next;
            }),
          onProposal: () => {
            /* 작성실은 이미 문서를 골랐다 — 다른 가지 제안은 여기서 받지 않는다 */
          },
          onMeta: (meta) => {
            const m = meta as {
              sessionId: string;
              expressBranch?: { branchType: string; proposalId: string } | null;
            };
            setSessionId(m.sessionId);
            localStorage.setItem(SESSION_KEY, m.sessionId);
            if (m.expressBranch) expressProposalId = m.expressBranch.proposalId;
            // 말할 때마다 약정서가 따라온다 — 서버가 턴마다 훑어 저장한 값을 읽는다.
            // 이게 없으면 "기부처와 돈을 말했는데 약정서가 비어 있다"가 된다 (2026-08-02)
            void refreshFacts(m.sessionId);
          },
        },
      );
      return expressProposalId;
    } catch (e) {
      const payload = (e as { payload?: { error?: { message: string; nextAction: string } } })
        .payload;
      setError(
        payload?.error ?? {
          message: "연결이 원활하지 않았어요.",
          nextAction: "잠시 후 다시 시도해 주세요.",
        },
      );
      setTurns((t) => t.slice(0, -1));
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** 제안에 대한 결정을 서버에 남긴다 — 카드를 고른 것이 곧 명시적 의사다 (FR-115B) */
  async function decide(proposalId: string, action: string): Promise<string | null> {
    const res = await fetch(`/api/branch/${proposalId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json();
    if (!body.ok) {
      setError(body.error);
      return null;
    }
    return body.data.status as string;
  }

  /** 문서 카드 선택 — 새 세션으로 진입 발화를 보내고, 무거운 가지는 숙려로.
   *  자산에서 온 진입은 발화에 그 자산이 실린다 (utteranceOverride) */
  async function pick(doc: SignableDoc, utteranceOverride?: string) {
    setDocType(doc);
    localStorage.setItem(DOC_KEY, doc);
    localStorage.removeItem(SESSION_KEY);
    setSessionId(null);
    setTurns([]);
    setFacts({});
    const proposalId = await send(utteranceOverride ?? DOC_ENTRY[doc].utterance, {
      forSession: null,
    });
    if (!proposalId) return;
    const status = await decide(proposalId, "ACCEPT");
    // 무거운 가지는 승낙만으로 열리지 않는다 — 오늘 진행할지 한 번 더 묻는다 (P4)
    if (status === "PENDING_RECONFIRM") setDeliberation(proposalId);
  }

  async function proceed(action: "PROCEED_TODAY" | "PROCEED_LATER") {
    if (!deliberation) return;
    const status = await decide(deliberation, action);
    setDeliberation(null);
    if (action === "PROCEED_LATER" || status !== "OPENED") {
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: "알겠습니다. 오늘은 여기까지 하고, 다음에 오시면 이어서 준비할게요.",
        },
      ]);
    }
  }

  /** 지금까지의 대화를 문서에 채운다 — 추출(FR-102) 후 미리보기 갱신 */
  async function fill() {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    const body = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId: sessionId }),
    }).then((r) => r.json());
    setBusy(false);
    if (!body.ok) return setError(body.error);
    await refreshFacts(sessionId);
  }

  /** 확정으로 — 확정 지점은 /confirm 하나뿐이다 (P1). 서명은 그 뒤 /doc이 맡는다 */
  async function toConfirm() {
    if (!sessionId) {
      return setError({
        message: "아직 문서에 담을 이야기가 없어요.",
        nextAction: "어디에, 얼마를 남기고 싶으신지 말씀해 주세요.",
      });
    }
    await fill();
    router.push(`/confirm?intentId=${sessionId}`);
  }

  function reset() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(DOC_KEY);
    setDocType(null);
    setSessionId(null);
    setTurns([]);
    setFacts({});
    setDeliberation(null);
    setError(null);
  }

  // ── 문서 선택 ───────────────────────────────────────────────────
  if (!docType) {
    const will = [STATUTES.CIVIL_1060, STATUTES.CIVIL_1066];
    return (
      <Shell title="어떤 서류를 준비할까요" fr={["FR-115B", "FR-104"]}>
        <p className="text-stone-500">
          대화로 함께 작성하고, 법이 인정하는 방식으로만 서명합니다.
        </p>

        <div className="mt-6 space-y-6">
          {DOC_GROUPS.map((group) => (
            <div key={group.heading} className="space-y-3">
              <h2 className="text-sm font-medium text-stone-500">{group.heading}</h2>
              {group.docs.map((doc) => (
                <button
                  key={doc}
                  type="button"
                  onClick={() => void pick(doc)}
                  className="block w-full rounded-2xl border border-stone-300 bg-white p-5 text-left transition hover:border-stone-500 hover:shadow-sm"
                >
                  <span className="flex items-center justify-between">
                    <span className="font-serif text-lg font-semibold text-stone-900">
                      {DOC_ENTRY[doc].title}
                    </span>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                      전자서명 가능
                    </span>
                  </span>
                  <span className="mt-2 block leading-relaxed text-stone-600">
                    {DOC_ENTRY[doc].desc}
                  </span>
                </button>
              ))}

              {group.heading === "사후에 남기기" && (
                <>
                  {/* 유언장 — 서명 버튼이 존재하지 않는다. 못 하는 것을 문 앞에서 말한다 (P2) */}
                  <div className="rounded-2xl border border-stone-200 bg-stone-100 p-5">
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-lg font-semibold text-stone-700">
                        유언장
                      </span>
                      <span className="rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-800">
                        전자서명으로는 효력이 없습니다
                      </span>
                    </div>
                    <p className="mt-2 leading-relaxed text-stone-600">
                      유언은 법이 정한 방식(자필증서 등)으로만 효력이 생깁니다. 대신
                      자필로 옮겨 쓰실 수 있게 안내해 드립니다.
                    </p>
                    <p className="mt-2 text-xs text-stone-600">
                      {will.map((s) => `${s.id} ${s.title}`).join(" · ")} (
                      {will[0]!.verifiedAt} 확인)
                    </p>
                    <Link
                      href="/will/handwriting"
                      className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                    >
                      자필 필사 가이드 보기
                    </Link>
                  </div>

                  {/* 상속 — 못 만드는 것을 숨기지 않는다. 지금 가능한 길만 정직하게 안내 */}
                  <div className="rounded-2xl border border-stone-200 bg-stone-100 p-5">
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-lg font-semibold text-stone-700">
                        상속에 관하여
                      </span>
                      <span className="rounded bg-stone-200 px-2 py-0.5 text-xs text-stone-600">
                        안내
                      </span>
                    </div>
                    <p className="mt-2 leading-relaxed text-stone-600">
                      유언이나 약정이 없으면 재산은 법이 정한 순위대로 상속됩니다.
                      특정한 곳에 남기고 싶으시면 위의 유산 기부 약정으로, 유언은
                      자필로 준비하실 수 있습니다. 상속인들 사이의 분할 협의 문서는
                      등기 실무상 서면·인감이 필요해 여기서 만들지 않습니다.
                    </p>
                    <Link
                      href="/guide"
                      className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                    >
                      상속이 궁금하면 물어보기
                    </Link>
                  </div>
                </>
              )}
            </div>
          ))}

          <Link
            href="/chat"
            className="block text-sm text-stone-500 underline underline-offset-4"
          >
            서류보다 마음 이야기를 먼저 하고 싶어요
          </Link>
        </div>
      </Shell>
    );
  }

  // ── 작성실: 대화가 아래 문서를 채운다 ──────────────────────────
  return (
    <Shell
      title={`${DOC_ENTRY[docType].title} 작성실`}
      fr={["FR-101", "FR-115B"]}
      headerBar={{
        leading: (
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-xl px-2 text-sm text-stone-500 underline underline-offset-4 hover:text-stone-700"
          >
            다른 서류로
          </button>
        ),
        trailing: (
          <button
            type="button"
            onClick={() => void toConfirm()}
            className="min-h-11 rounded-xl bg-ink px-3 text-sm text-stone-50"
          >
            내용 확인하고 서명 준비
          </button>
        ),
      }}
      bottomBar={
        <div className="space-y-2">
          <div className="flex items-center justify-end">
            {/* P4 — 전 화면 필수 */}
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-stone-500 transition hover:bg-stone-100 hover:text-stone-700"
            >
              나중에 생각할래요
            </Link>
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
              placeholder="예: 부산문화재단에 오백만원을 남기고 싶어요"
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
      <div className="space-y-4">
        {view === "chat" ? (
          <>
            {assetParam && (
              <p className="rounded-xl bg-stone-100 px-4 py-2 text-sm text-stone-600">
                남기려는 자산 — {assetParam}
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.role === "user" ? "text-right" : ""}>
                <span
                  className={
                    t.role === "user"
                      ? "inline-block max-w-[85%] rounded-2xl bg-ink px-4 py-2.5 text-left leading-relaxed text-stone-50"
                      : "inline-block max-w-[85%] whitespace-pre-line rounded-2xl bg-white px-4 py-2.5 font-serif leading-relaxed text-stone-800 shadow-sm"
                  }
                >
                  {t.text || "…"}
                </span>
              </div>
            ))}
            <div ref={endRef} />

            {/* 숙려 — 무거운 약정은 오늘 할지 한 번 더 묻는다. 재촉하지 않는다 (P4) */}
            {deliberation && (
              <div className="rounded-xl border border-stone-400 bg-white p-4">
                <p className="leading-relaxed text-stone-800">
                  유산 기부는 무게가 있는 결정이라, 진행 전에 한 번 더 여쭙습니다.
                  오늘 준비를 시작할까요?
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => void proceed("PROCEED_TODAY")}
                    className="min-h-11 flex-1 rounded-xl bg-ink px-4 text-sm text-stone-50"
                  >
                    오늘 시작할게요
                  </button>
                  <button
                    onClick={() => void proceed("PROCEED_LATER")}
                    className="min-h-11 flex-1 rounded-xl border border-stone-300 px-4 text-sm text-stone-600"
                  >
                    다음에 할게요
                  </button>
                </div>
              </div>
            )}

            <ErrorNote error={error} />

            {/* 문서는 대화에 끼어들지 않는다 — 현황 한 줄과 문만 남긴다 */}
            <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3">
              <div className="flex flex-wrap gap-1.5 text-xs">
                {(docType === "LEGACY_GIFT_AGREEMENT"
                  ? ([["받으실 곳", facts.orgName], ["금액", facts.amount]] as const)
                  : docType === "HERITAGE_SUPPORT_PLEDGE"
                    ? ([["후원 대상", facts.orgName], ["금액", facts.amount]] as const)
                    : ([["지역", facts.region], ["금액", facts.amount]] as const)
                ).map(([label, v]) => (
                  <span
                    key={label}
                    className={`rounded px-2 py-0.5 ${
                      v != null
                        ? "bg-emerald-100 text-emerald-800"
                        // stone-100 바탕 위에서는 500이 4.39:1로 못 미친다 — 한 단계 더
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {label} {v != null ? "채움" : "비어 있음"}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setView("doc");
                  if (sessionId) void refreshFacts(sessionId);
                }}
                className="min-h-11 shrink-0 rounded-xl border border-stone-300 px-3 text-sm text-stone-700 hover:bg-stone-100"
              >
                약정서 보기
              </button>
            </div>
          </>
        ) : (
          <>
            <DocPreview docType={docType} facts={facts} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setView("chat")}
                className="min-h-11 flex-1 rounded-xl border border-stone-300 bg-white text-sm text-stone-700 transition hover:bg-stone-100"
              >
                대화로 돌아가기
              </button>
              <button
                type="button"
                onClick={() => void fill()}
                disabled={busy || !sessionId}
                className="min-h-11 flex-1 rounded-xl border border-stone-300 bg-white text-sm text-stone-700 transition hover:bg-stone-100 disabled:text-stone-300"
              >
                {busy ? "정리하는 중…" : "최신 대화 반영하기"}
              </button>
            </div>
            <ErrorNote error={error} />
          </>
        )}
      </div>
    </Shell>
  );
}
