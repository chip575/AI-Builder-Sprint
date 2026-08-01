// /chat 전용 — 대화 옆으로 부가 정보를 빼는 곁칸 (S2 · FR-101)
//
// ⚠ 여기 들어가는 것은 **맥락**이지 진도가 아니다.
//   진행률 막대·N분의 M·단계 표시·체크리스트를 만들지 않는다 (P4 · FR-111).
//   숫자는 세어주기까지만 한다 — "지금까지 2가지 이야기". 분모가 붙는 순간
//   사용자는 남은 칸을 채워야 할 과제로 읽고, 그건 재촉이 된다.
//
// 겹쳐서 연다 — 밀어내지 않는다. 곁칸이 대화 폭을 바꾸면 열고 닫을 때마다
// 글줄이 다시 흐르고, 읽던 자리를 잃는다.
//
// Shell에 넣지 않은 이유: 이 칸이 필요한 화면은 /chat 하나뿐이다.
// Shell을 고치면 15개 화면 전부가 영향을 받는다.
//
// "나중에 생각할래요"는 여기 두지 않는다 — 전 화면 필수 항목이라 Shell의 고정 위치가
// 정본이고, 곁칸으로 옮기면 닫았을 때 그만둘 길이 사라진다 (P4).
"use client";

import { useEffect } from "react";

/** 토글의 aria-controls 대상 */
export const CHAT_SIDEBAR_ID = "chat-sidebar-panel";

/**
 * 헤더에 놓는 여닫이. 대화 흐름 안이 아니라 제목 왼쪽에 산다 —
 * 대화 안에 있으면 말이 쌓일수록 위로 밀려 닿을 수 없게 된다.
 */
export function ChatSidebarToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      // 이름은 상태에 따라 바뀌지 않는다. 열림·닫힘은 aria-expanded가 말한다 —
      // 이름까지 같이 바뀌면 스크린리더 사용자는 무엇이 바뀐 건지 두 번 듣는다.
      aria-label="정리 내용"
      aria-expanded={open}
      aria-controls={CHAT_SIDEBAR_ID}
      // P2(시니어) — 손가락으로 눌리는 크기. 44px는 타협선이 아니라 하한이다
      className="flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-xl px-2 text-sm text-stone-600 transition hover:bg-stone-200/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
    >
      {/* 햄버거 — 아이콘 하나 때문에 라이브러리를 들이지 않는다 */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M3 5.5h14M3 10h14M3 14.5h14" />
      </svg>
      정리 내용
    </button>
  );
}

interface PanelProps {
  open: boolean;
  onClose: () => void;
  /** 지금까지 정리된 이야기 수. **분모 없는 숫자**다 (P4 · FR-111) */
  storyCount: number | null;
  /** 진행 중인 가지 이름. 대화에서 의사가 드러나야 생긴다 */
  branchLabel: string | null;
  /** 지난 세션을 버리고 처음부터 */
  onReset: () => void;
}

/** 곁칸 알맹이. 전부 고딕이다 — 명조는 "서비스가 건네는 말"에만 쓴다 */
function SidebarBody({ storyCount, branchLabel, onReset }: Omit<PanelProps, "open" | "onClose">) {
  // 0을 숫자로 말하지 않는다. "0가지가 정리되어 있습니다"는 빈손을 확인시키는 문장이고,
  // 처음 온 사람에게 "지난번"은 아예 틀린 말이다.
  const hasStories = storyCount !== null && storyCount > 0;

  return (
    <div className="space-y-4 text-sm">
      {/* 두 카드가 같은 말("이어진다")을 반복하던 것을 하나로 합쳤다 */}
      <div className="rounded-xl border border-stone-300 bg-white p-4">
        <p className="font-medium text-stone-800">
          {hasStories ? "지난번 이야기를 이어갑니다" : "이제 시작하는 이야기입니다"}
        </p>
        <p className="mt-1 leading-relaxed text-stone-600">
          {hasStories
            ? `지금까지 ${storyCount}가지 이야기가 정리되어 있습니다. 다음에 오셔도 이어집니다.`
            : "아직 정리된 이야기가 없어요. 편하게 말씀하시면 하나씩 정리해 둘게요."}
        </p>
        {/* 되돌릴 것이 있을 때만 보인다 — 빈손인 사람에게 "새로 시작"은 할 일이 없다 */}
        {hasStories && (
          <button
            type="button"
            onClick={onReset}
            className="mt-3 min-h-11 text-stone-500 underline underline-offset-4 hover:text-stone-700"
          >
            새로 시작할게요
          </button>
        )}
      </div>

      {branchLabel && (
        <div className="rounded-xl border border-stone-300 bg-white p-4">
          <p className="text-stone-500">진행 중인 정리</p>
          <p className="mt-1 font-medium text-stone-800">{branchLabel}</p>
        </div>
      )}
      {/* 회상으로 가는 길은 하단 바로 옮겼다 — 같은 곳으로 가는 문을 두 개 두지 않는다 */}
    </div>
  );
}

/**
 * 왼쪽에서 겹쳐 나오는 곁칸. 데스크톱·모바일 동작이 같다.
 * 바깥을 누르거나 Esc로 닫힌다.
 */
export function ChatSidebarPanel({ open, onClose, ...body }: PanelProps) {
  // 덮은 것은 키보드로도 걷어낼 수 있어야 한다 (NFR-708)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/30"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* 닫혀 있어도 DOM에 남긴다 — 토글의 aria-controls가 가리킬 대상이 있어야 한다 */}
      <aside
        id={CHAT_SIDEBAR_ID}
        hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label="정리 내용"
        className="fixed left-0 top-0 z-50 h-full w-80 max-w-[85%] overflow-y-auto border-r border-stone-200 bg-stone-50 p-5 shadow-xl"
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="정리 내용 닫기"
            className="min-h-11 min-w-11 rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-600 hover:bg-stone-100"
          >
            닫기
          </button>
        </div>
        <SidebarBody {...body} />
      </aside>
    </>
  );
}
