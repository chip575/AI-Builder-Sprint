// S-HEARTWILL · 마음 유언 — 살아있는 유서 (FR-111)
//
// 이 화면이 지키는 것은 두 가지다.
//  [1] 승인하지 않은 문장은 문서가 아니다. 대기 목록과 본문을 **다른 자리**에 그린다 —
//      한 목록에 섞어 놓고 체크 표시로만 나누면 "이미 들어가 있는데 표시만 꺼진 것"처럼 보인다.
//  [2] 법적 효력이 없다는 사실은 조건부로 사라지지 않는다. 최상단에 항상 있고,
//      인쇄물에도 남는다 — 이 화면에는 인쇄에서 숨기는 클래스를 쓰지 않는다.
//      종이만 남는 순간이 오고, 그때 이 고지가 없으면 유언장으로 읽힌다.
//
// 서버 컴포넌트다. 문단 목록을 실어 보낼 계약이 lib/contracts에 없으므로 서버가 직접 읽어
// 렌더한다 (actions.ts 상단 주석). 승인 전송만 계약이 있는 경로로 나간다.
import { Notice, Shell } from "@/app/(ui)/_components/Shell";
import { store } from "@/lib/store";
import { addOwnSentence, draftFromRecall } from "./actions";
import { ParagraphApproval } from "./ParagraphApproval";

export const dynamic = "force-dynamic";

/** 영구 고지 — 문구를 조건부로 감싸지 말 것 (NON_BINDING의 정의, NFR-706) */
const NON_BINDING = "법적 효력이 없는 문서입니다.";

const preview = (text: string) =>
  text.length > 24 ? `${text.slice(0, 24)}…` : text;

export default async function HeartWillPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).sessionId;
  const sessionId = Array.isArray(raw) ? raw[0] : raw;
  const session = sessionId ? await store.getSession(sessionId) : undefined;

  // 마음 유언 테이블은 사람 검토 대기 중이라(20260730160227) 저장소에 아직 없을 수 있다.
  // 그때 화면이 그대로 터지면 사용자는 원인을 알 수 없다 — 못 불러왔다고 **말한다**.
  // 조용히 빈 화면을 그리지 않는다: 빈 목록은 "남긴 이야기가 없다"로 읽히기 때문이다
  let head;
  let unavailable = false;
  if (session) {
    try {
      head = await store.getHeartWillHead(session.id);
    } catch {
      unavailable = true;
    }
  }

  const body = (head?.paragraphs ?? []).filter((p) => p.acceptedAt !== null);
  const pending = (head?.paragraphs ?? []).filter((p) => p.acceptedAt === null);

  return (
    <Shell title="마음 유언" fr={["FR-111"]} back={{ href: "/chat", label: "대화로" }}>
      {/* 최상단·항상·인쇄물에도 — 이 문서가 무엇이 아닌지부터 말한다 */}
      <div className="mb-6">
        <Notice>
          {NON_BINDING} 마음을 남기는 글이며, 재산을 옮기거나 유언의 효력을 갖지 않습니다.
          법적 효력이 필요한 유언장은 손으로 직접 쓰셔야 합니다 (민법 제1066조).
        </Notice>
      </div>

      {!session ? (
        <section className="space-y-4">
          <p className="leading-relaxed text-stone-700">
            회상 대화에서 남기신 이야기를 문단으로 정리하는 곳입니다. 이어서 하실 대화를
            알려주세요.
          </p>
          <form method="get" className="space-y-3">
            <label htmlFor="sessionId" className="block text-sm text-stone-600">
              대화 번호
            </label>
            <input
              id="sessionId"
              name="sessionId"
              defaultValue={sessionId ?? ""}
              placeholder="회상 대화에서 이어집니다"
              className="w-full rounded-xl border border-stone-300 p-4 text-stone-900 outline-none focus:border-stone-500"
            />
            <button
              type="submit"
              className="min-h-11 w-full rounded-xl bg-stone-900 px-6 py-3 text-stone-50 transition hover:bg-stone-700"
            >
              이어서 보기
            </button>
          </form>
          {sessionId && (
            <p className="text-sm text-rose-900">해당 대화를 찾을 수 없습니다.</p>
          )}
        </section>
      ) : unavailable ? (
        // 쓰기 동작도 함께 감춘다 — 읽지 못하는 저장소에 쓰기를 권할 수는 없다
        <section className="space-y-3">
          <p className="leading-relaxed text-stone-800">
            지금은 남기신 문장을 불러올 수 없습니다.
          </p>
          <p className="text-sm text-stone-600">
            잠시 후 다시 열어 주세요. 회상 대화에서 남기신 이야기는 그대로 있습니다.
          </p>
        </section>
      ) : (
        <div className="space-y-10">
          {/* ── 본문 — 승인된 문단만 ───────────────────────── */}
          <section>
            <h2 className="mb-3 text-lg text-stone-900">지금까지 남기신 글</h2>
            {body.length === 0 ? (
              <p className="text-sm text-stone-500">
                아직 문서에 담긴 문장이 없습니다. 아래에서 남기실 문장을 골라 주세요.
              </p>
            ) : (
              <article className="space-y-4 rounded-xl border border-stone-200 p-5">
                {body.map((p) => (
                  <p key={p.id} className="leading-relaxed text-stone-900">
                    {p.body}
                  </p>
                ))}
              </article>
            )}
          </section>

          {/* ── 승인 대기 — 아직 문서가 아니다 ─────────────── */}
          <section>
            <h2 className="mb-3 text-lg text-stone-900">고르실 문장</h2>
            <ParagraphApproval
              sessionId={session.id}
              paragraphs={pending.map((p) => ({
                id: p.id,
                body: p.body,
                origin: p.origin,
              }))}
            />
          </section>

          {/* ── 문장 만들기 ────────────────────────────────── */}
          <section className="space-y-6 border-t border-stone-200 pt-8">
            <form action={draftFromRecall} className="space-y-2">
              <input type="hidden" name="sessionId" value={session.id} />
              <button
                type="submit"
                className="min-h-11 w-full rounded-xl border border-stone-300 px-6 py-3 text-stone-700 transition hover:bg-stone-100"
              >
                회상에서 남긴 이야기 불러오기
              </button>
              <p className="text-sm text-stone-500">
                남기신 이야기를 문단 자리로 옮겨 놓습니다. 옮겨 놓기만 하고, 문서에는
                고르신 것만 들어갑니다.
              </p>
            </form>

            <form action={addOwnSentence} className="space-y-3">
              <input type="hidden" name="sessionId" value={session.id} />
              <h3 className="text-base text-stone-900">직접 쓰실 문장</h3>
              <textarea
                name="body"
                rows={4}
                placeholder="하고 싶은 말씀을 그대로 적어 주세요."
                className="w-full rounded-xl border border-stone-300 p-4 text-stone-900 outline-none focus:border-stone-500"
              />
              <label htmlFor="sourceUtteranceId" className="block text-sm text-stone-600">
                어떤 이야기에서 나온 말씀인가요
              </label>
              {/* 근거 없는 문단은 만들 수 없다 — 선택지가 곧 근거다 (FR-111) */}
              <select
                id="sourceUtteranceId"
                name="sourceUtteranceId"
                required
                className="min-h-11 w-full rounded-xl border border-stone-300 p-3 text-stone-900"
              >
                {session.utterances.map((u) => (
                  <option key={u.id} value={u.id}>
                    {preview(u.text)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={session.utterances.length === 0}
                className="min-h-11 w-full rounded-xl border border-stone-300 px-6 py-3 text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
              >
                고를 문장에 추가하기
              </button>
              <p className="text-sm text-stone-500">
                {session.utterances.length === 0
                  ? "먼저 대화에서 이야기를 남겨 주세요. 그 원문이 문단의 근거가 됩니다."
                  : "쓰신 문장도 바로 문서에 들어가지 않습니다. 위에서 고르셔야 담깁니다."}
              </p>
            </form>
          </section>
        </div>
      )}
    </Shell>
  );
}
