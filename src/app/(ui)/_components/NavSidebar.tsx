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
import { InlineHelp } from "./HelpTip";

export const NAV_SIDEBAR_ID = "nav-sidebar-panel";

/** 일 — 하는 일로 이름을 짓는다. 코드명(CLM)을 화면에 노출하지 않는다.
 *  ⚠ 화면마다 목록을 달리하지 않는다. 곁칸은 "어디로든 가는 지도"라서 열 때마다
 *  내용이 바뀌면 사용자가 무엇이 있을지 예측할 수 없다 (그래서 숨김 기능을 없앴다) */
const LINKS: { href: string; label: string; hint: string }[] = [
  { href: "/estate", label: "내 유산", hint: "자산과 다가오는 약속" },
  { href: "/write", label: "새 약정 준비하기", hint: "대화로 서류를 채웁니다" },
  { href: "/clm", label: "서류 이력", hint: "남긴 서류를 시간 순서로" },
  // ⚠ "종이 문서로 등록"(/branch/paper-scan)을 뺐다 (2026-08-03).
  //   그 화면은 intentId가 있어야 업로드 칸이 뜨는데, **거기로 intentId를 달고 가는
  //   경로가 하나도 없다.** 곁칸으로 들어가면 언제나 "작성실에서 먼저 고르세요"만 보이고,
  //   작성실은 돌아오는 길을 만들어 주지 않는다 — 누구도 끝까지 갈 수 없는 문이었다.
  //   화면과 API(paper-scan/upload·extract)는 남아 있다. 작성실에서 그 문서로 이어지는
  //   길이 생기면 그때 다시 연다.
];

/** 계정 — 위의 "일"과 성격이 다르다. 그래서 카드가 아니라 작은 링크로 무게를 낮춘다 */
/** 계정 자리. 설명은 곁에 붙는 물음표가 맡는다 —
 *  줄에 길게 적으면 좁은 화면에서 두 줄로 접혀 다른 문들과 결이 달라진다 */
const ACCOUNT = { href: "/mypage", label: "마이페이지" };

export function NavSidebarToggle({
  open,
  onToggle,
  label = "메뉴",
}: {
  open: boolean;
  onToggle: () => void;
  /** 화면마다 이 곁칸을 부르는 이름이 다를 수 있다. 기본값은 지금까지의 "메뉴" */
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      // 이름은 상태에 따라 바뀌지 않는다 — 열림·닫힘은 aria-expanded가 말한다
      aria-label={label}
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
      {label}
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

        {/* 계정 — 위의 "일"과 성격이 다르므로 구분선 아래에, 카드가 아닌 작은 링크로 둔다.
            ⚠ "이전 화면으로"는 뺐다: 곁칸은 어디로든 가는 지도인데 뒤로가기는 직전 한 곳만
            가리켜 성격이 다르고, 서랍을 열어야 뒤로 가는 건 두 단계라 뒤로가기의 장점을
            없앤다. 되돌아가야 하는 화면은 Shell의 back prop을 쓴다 */}
        <div className="mt-6 space-y-1 border-t border-stone-200 pt-4">
          <div className="flex items-center gap-2 px-4">
            <Link
              href={ACCOUNT.href}
              onClick={onClose}
              aria-current={pathname === ACCOUNT.href ? "page" : undefined}
              className="flex min-h-11 flex-1 items-center rounded-xl text-sm text-stone-600 hover:text-stone-900"
            >
              {ACCOUNT.label}
            </Link>
            {/* 물음표는 Link **바깥**에 둔다 — 링크 안에 버튼을 넣으면 눌렀을 때
                둘 중 무엇이 동작할지가 브라우저마다 다르다 */}
            <InlineHelp label="마이페이지">
              약정서에 인쇄될 <strong>성명·연락처</strong>를 미리 정해 두는 곳입니다.
              서명하실 때마다 다시 적지 않으셔도 됩니다.
              <br />
              무언가를 알려 드릴 <strong>주소록</strong>도 여기 있습니다.
            </InlineHelp>
          </div>
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
