// 문단 승인 — 이 화면의 유일한 상호작용 (FR-111 · P1)
//
// 규칙 셋이 이 컴포넌트의 형태를 정했다:
//  [1] 체크박스는 **전부 꺼진 채로** 시작한다. 한 번에 모두 켜는 버튼도 두지 않는다 —
//      클릭 한 번으로 전부 승인되면 문단 단위 승인은 이름만 남는다.
//  [2] AI가 쓴 문장과 본인이 쓴 문장은 눈으로 구분된다. 색 하나로만 나누지 않고
//      표시 문구를 함께 단다 (색을 못 보는 경우에도 구분돼야 한다 — NFR-701).
//  [3] 서명 버튼이 없다. 이 문서는 NON_BINDING이고, 여기에 서명 자리를 만들면
//      "서명했으니 효력이 있다"는 오해가 화면에서 생긴다 (민법 §1066).
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorNote, PrimaryButton } from "@/app/(ui)/_components/Shell";
import type { HeartWillApplyReq, HeartWillVersionRes } from "@/lib/contracts";
import type { HeartWillOrigin } from "@/lib/store/types";

export interface PendingParagraph {
  id: string;
  body: string;
  origin: HeartWillOrigin;
}

/** 출처별 표시 — AI 문장은 점선, 본인 문장은 실선. 문구가 색을 보조한다 */
const LOOK: Record<HeartWillOrigin, { label: string; box: string; tag: string }> = {
  AI_DRAFT: {
    label: "AI가 옮긴 문장",
    box: "border-dashed border-stone-300 bg-white",
    tag: "bg-stone-100 text-stone-600",
  },
  USER_EDITED: {
    label: "직접 고치신 문장",
    box: "border-solid border-stone-400 bg-stone-50",
    tag: "bg-ink text-stone-50",
  },
  USER_WRITTEN: {
    label: "직접 쓰신 문장",
    box: "border-solid border-stone-400 bg-stone-50",
    tag: "bg-ink text-stone-50",
  },
};

export function ParagraphApproval({
  sessionId,
  paragraphs,
}: {
  sessionId: string;
  paragraphs: PendingParagraph[];
}) {
  const router = useRouter();
  // 기본은 전부 미승인 — 초기값을 paragraphs로 채우지 말 것 (P1)
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<HeartWillVersionRes | null>(null);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    if (busy || checked.size === 0) return;
    setBusy(true);
    setError(null);
    const payload: HeartWillApplyReq = {
      sessionId,
      acceptedParagraphIds: [...checked],
    };
    try {
      const res = await fetch("/api/heartwill/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!body?.ok) {
        setError(
          body?.error ?? {
            message: "문장을 남기지 못했습니다.",
            nextAction: "잠시 후 다시 시도해 주세요.",
          },
        );
        return;
      }
      setApplied(body.data as HeartWillVersionRes);
      setChecked(new Set()); // 다음 판단도 미승인에서 시작한다
      router.refresh(); // 본문·대기 목록을 서버에서 다시 받는다
    } catch {
      setError({
        message: "문장을 남기지 못했습니다.",
        nextAction: "연결을 확인한 뒤 다시 시도해 주세요.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (paragraphs.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        지금 판단하실 문장이 없습니다. 회상 대화에서 이야기를 더 남기시면 여기에 모입니다.
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-stone-600">
        아래 문장은 아직 문서에 들어가 있지 않습니다. 남기실 문장만 골라 주세요.
      </p>

      <ul className="space-y-3">
        {paragraphs.map((p) => {
          const look = LOOK[p.origin];
          const on = checked.has(p.id);
          return (
            <li key={p.id}>
              <label
                className={`flex min-h-11 cursor-pointer gap-3 rounded-xl border-2 p-4 transition ${look.box} ${
                  on ? "ring-2 ring-stone-800" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(p.id)}
                  className="mt-1 size-5 shrink-0 accent-stone-800"
                />
                <span className="flex-1">
                  <span
                    className={`mb-2 inline-block rounded-full px-2 py-0.5 text-xs ${look.tag}`}
                  >
                    {look.label}
                  </span>
                  <span className="block leading-relaxed text-stone-900">{p.body}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <PrimaryButton onClick={apply} disabled={busy || checked.size === 0}>
        {busy
          ? "남기는 중…"
          : checked.size === 0
            ? "남기실 문장을 골라 주세요"
            : `고른 ${checked.size}문장을 문서에 남기기`}
      </PrimaryButton>

      {/* 실제 동작만 말한다. 문단을 지우거나 직접 편집하는 기능은 없고, 고치는 길은
          "같은 이야기를 근거로 새 문장을 승인하면 앞 문장을 대신한다" 하나뿐이다
          (store.applyHeartWill — 근거 발화가 같으면 옛 문단을 잇지 않는다).
          ⚠ "언제든 고칠 수 있다"고 적어 두면 없는 기능을 믿고 승인하게 된다 (P4) */}
      {applied && (
        <p className="text-sm text-stone-600">
          {applied.diff.length === 0
            ? "문서는 그대로입니다."
            : `${applied.diff.length}개 문단이 반영되었습니다. 고쳐 남기고 싶으시면 아래 "직접 쓰실 문장"에서 같은 이야기를 골라 새로 남겨 주세요 — 앞의 문장을 대신합니다.`}
        </p>
      )}

      <ErrorNote error={error} />
    </section>
  );
}
