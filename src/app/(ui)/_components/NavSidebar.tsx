// 이동용 곁칸 — 관리 화면(내 유산·서류 이력)의 문을 한곳에 모은다 (FR-101 · P4)
//
// ChatSidebar와 다른 물건이다. 저쪽은 /chat의 **맥락**(정리된 내용)을 보여주고,
// 이쪽은 **화면 사이를 옮겨 다니는 문**이다. 한 컴포넌트로 합치면 "곁칸을 연다"가
// 화면마다 다른 뜻이 되어, 사용자가 무엇이 나올지 예측할 수 없게 된다.
//
// Shell에 넣지 않은 이유는 저쪽과 같다 — 필요한 화면에만 붙인다. Shell을 고치면
// 화면 전부가 영향을 받고, 대화 화면에는 이 문들이 방해가 된다.
//
// "나중에 생각할래요"는 여기 두지 않는다. 전 화면 필수라 Shell의 고정 위치가 정본이고,
// 곁칸으로 옮기면 닫았을 때 그만둘 길이 사라진다 (P4).
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export const NAV_SIDEBAR_ID = "nav-sidebar-panel";

/** 문 목록 — 이름은 하는 일로 짓는다. 코드명(CLM)을 화면에 노출하지 않는다 */
const LINKS: { href: string; label: string; hint: string }[] = [
  { href: "/estate", label: "내 유산", hint: "자산과 다가오는 약속" },
  { href: "/clm", label: "서류 이력", hint: "남긴 서류를 시간 순서로" },
  { href: "/write", label: "새 약정 준비하기", hint: "대화로 서류를 채웁니다" },
];

export function NavSidebarToggle({
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
      // 이름은 상태에 따라 바뀌지 않는다 — 열림·닫힘은 aria-expanded가 말한다
      aria-label="메뉴"
      aria-expanded={open}
      aria-controls={NAV_SIDEBAR_ID}
      className="flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-xl px-2 text-sm text-stone-600 transition hover:bg-stone-200/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
    >
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
      메뉴
    </button>
  );
}

export function NavSidebarPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // 덮은 것은 키보드로도 걷어낼 수 있어야 한다 (NFR-708)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function logout() {
    // 쿠키는 서버가 만료시킨다 — 클라이언트가 지울 수 없다(HttpOnly, NFR-714)
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    onClose();
    // replace — 뒤로 가기로 로그인 상태 화면에 되돌아가지 않게 한다
    router.replace("/");
  }

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
        id={NAV_SIDEBAR_ID}
        hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label="메뉴"
        className="fixed left-0 top-0 z-50 flex h-full w-80 max-w-[85%] flex-col overflow-y-auto border-r border-stone-200 bg-stone-50 p-5 shadow-xl"
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="min-h-11 min-w-11 rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-600 hover:bg-stone-100"
          >
            닫기
          </button>
        </div>

        <nav className="space-y-2">
          {LINKS.map((l) => {
            const here = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={onClose}
                // 지금 있는 곳을 표시한다 — 눌러도 아무 일이 없는 이유를 알려준다
                aria-current={here ? "page" : undefined}
                className={
                  "block rounded-xl border px-4 py-3 transition " +
                  (here
                    ? "border-stone-400 bg-white"
                    : "border-stone-200 bg-white hover:border-stone-400")
                }
              >
                <span className="block text-stone-900">{l.label}</span>
                <span className="mt-0.5 block text-sm text-stone-500">{l.hint}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 space-y-2 border-t border-stone-200 pt-4">
          <button
            type="button"
            onClick={() => {
              onClose();
              router.back();
            }}
            className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-4 text-left text-sm text-stone-700 hover:bg-stone-100"
          >
            ← 이전 화면으로
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="min-h-11 w-full rounded-xl px-4 text-left text-sm text-stone-500 hover:bg-stone-200/70"
          >
            로그아웃
          </button>
        </div>
      </aside>
    </>
  );
}
