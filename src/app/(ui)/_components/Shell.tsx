// 화면 공통 뼈대 — 와이어프레임(02.1.1)의 규칙을 코드로 고정한다.
// · 우상단 FR 태그 배지 (명세 추적)
// · 우하단 "나중에 생각할래요" (전 화면 존재 — FR-101 · P4)
// · 접근성: 본문 16px 기준·고대비·터치 44px+ (NFR-701, P2 기준)
"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { NavSidebarPanel, NavSidebarToggle } from "./NavSidebar";

export function Shell({
  title,
  fr,
  children,
  footer,
  back,
  headerBar,
  bottomBar,
  nav = true,
}: {
  title: string;
  /** 이 화면이 구현하는 FR — 우상단 배지 */
  fr: string[];
  children: ReactNode;
  footer?: ReactNode;
  /** 이전 화면으로 — 없으면 사용자는 홈으로 나가는 수밖에 없다.
   *  "나중에 생각할래요"는 그만두는 문이지 되돌아가는 문이 아니다 */
  back?: { href: string; label: string };
  /** 조작을 헤더에 얹는 화면(/chat)용 2행 머리. 1행은 좌우 조작, 2행은 가운데 제목이다.
   *  헤더가 따라붙는 이유: 본문에 두면 말이 쌓일수록 위로 밀려 닿을 수 없게 된다.
   *  넘기지 않는 화면은 지금까지의 한 줄 머리 그대로다 */
  headerBar?: { leading?: ReactNode; trailing?: ReactNode };
  /** 화면 아래에 붙는 입력 바(/chat). 넘기면 레이아웃이 이렇게 바뀐다:
   *  · 높이 기준이 dvh가 된다 — 100vh는 모바일에서 키보드가 올라와도 갱신되지 않아
   *    입력창이 키보드 뒤로 숨는다
   *  · 고정 "나중에 생각할래요"를 띄우지 않는다 (아래 여백 pb-32도 함께 빠진다)
   *  ⚠ 그러므로 **바 안에 "나중에 생각할래요"를 반드시 넣어야 한다.**
   *    전 화면 필수 항목이라 어느 화면에서도 사라지면 안 된다 (P4) */
  bottomBar?: ReactNode;
  /** 이동용 곁칸. **기본으로 켜진다** — 문이 화면마다 다른 자리에 있으면 사용자는
   *  매번 찾아야 한다. 끄는 자리는 로그인 전 화면뿐이다(/auth): 갈 곳이 전부
   *  로그인 뒤에 있고 로그아웃 항목은 뜻이 없다 */
  nav?: boolean;
}) {
  const [navOpen, setNavOpen] = useState(false);
  // 곁칸을 켜면 머리가 2행이 된다 — 토글이 설 자리가 1행이기 때문이다.
  // 그래서 headerBar를 넘기지 않은 화면도 2행 머리를 쓰게 된다
  const bar = nav || headerBar ? (headerBar ?? {}) : null;

  const heading = (
    /* 제목은 서비스가 건네는 말이므로 명조. 전 화면 공통이고 화면별 예외는 두지 않는다.
       ⚠ font-serif는 이 h1에만 건다 — header나 main에 걸면 Notice의 법적 고지·
       ErrorNote·버튼·금액/해시까지 명조가 되고, 그건 P4(다크패턴 금지)에 걸린다.
       경계: "서비스가 건네는 말"은 명조, "법적 사실과 조작 요소"는 고딕. */
    <h1 className="font-serif text-xl font-semibold text-stone-900">{title}</h1>
  );

  const badges =
    process.env.NEXT_PUBLIC_DEV_UI === "1" ? (
      <div className="flex flex-wrap justify-end gap-1">
        {fr.map((f) => (
          <span
            key={f}
            className="rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600"
          >
            {f}
          </span>
        ))}
      </div>
    ) : null;

  return (
    <main
      // dvh로 잰다 — 100vh는 모바일에서 키보드가 올라와도 갱신되지 않아 입력창이 가려진다.
      // 하단 바가 흐름 안에 있으므로 고정 버튼용 아래 여백(pb-32)은 필요 없다
      className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-8 text-base"
    >
      {back && (
        <Link
          href={back.href}
          className="mb-3 inline-flex min-h-11 items-center text-sm text-stone-500 hover:text-stone-700"
        >
          ← {back.label}
        </Link>
      )}

      {bar ? (
        // 2행 — 위는 좌우 조작, 아래는 가운데 제목. 배경을 깔아야 아래 글이 비쳐 보이지 않는다
        <header className="sticky top-0 z-20 -mx-5 mb-6 bg-stone-50 px-5 py-3">
          <div className="flex items-center justify-between gap-2">
            {/* 왼쪽이 비어도 자리는 지킨다 — 없으면 오른쪽 조작이 가운데로 끌려온다 */}
            <div className="flex min-w-0 items-center gap-1">
              {nav && (
                <NavSidebarToggle
                  open={navOpen}
                  onToggle={() => setNavOpen((v) => !v)}
                />
              )}
              {bar.leading ?? (!nav ? <span /> : null)}
            </div>
            <div className="flex items-center gap-2">
              {badges}
              {bar.trailing}
            </div>
          </div>
          <div className="mt-1 text-center">{heading}</div>
        </header>
      ) : (
        <header className="mb-6 flex items-start justify-between gap-4">
          {heading}
          {badges}
        </header>
      )}

      {nav && (
        <NavSidebarPanel open={navOpen} onClose={() => setNavOpen(false)} />
      )}

      <div className="flex-1">{children}</div>

      {footer ? <div className="mt-8">{footer}</div> : null}

      {/* 하단 바 — 전 화면 같은 자리다. 화면이 자기 바를 주면 그것을, 아니면 기본 바를 쓴다.
          문서 흐름 안에서 아래에 붙인다: fixed로 띄우면 모바일 키보드가 올라올 때
          레이아웃 뷰포트가 그대로라 입력창이 키보드 뒤로 들어간다.

          z-50인 이유: sticky는 **그 자체로 stacking context를 만든다.** 그래서 바 안쪽 자식에
          z-index를 줘도 바깥의 오버레이(z-40) 위로 올라가지 못한다. 바에 직접 걸어야
          곁칸이 열려도 "나중에 생각할래요"가 덮이지 않는다 (P4 — 그만두는 문은 막히지 않는다). */}
      <div className="sticky bottom-0 z-50 -mx-5 mt-6 border-t border-stone-200 bg-stone-50 px-5 py-3">
        {bottomBar ?? (
          /* P4 — 어떤 단계에서도 중단할 수 있다. 재촉 문구 금지 */
          <div className="flex justify-end">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-stone-500 transition hover:bg-stone-100 hover:text-stone-700"
            >
              나중에 생각할래요
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

/** 고지 문구 — 확정 표현 금지·법률 자문 아님 (NFR-706) */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
      {children}
    </p>
  );
}

/** 다음 단계 버튼 — 터치 44px+ */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 w-full rounded-xl bg-ink px-6 py-3 text-stone-50 transition hover:bg-ink-hover disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600"
    >
      {children}
    </button>
  );
}

/** 서버 error envelope의 nextAction을 그대로 보여준다 (NFR-705 — 기술 코드 노출 금지)
 *
 *  error.route가 있으면 **거기로 가는 링크를 함께 낸다.** 서버가 대체 경로를 실어 보내는데
 *  화면이 안 읽으면, 사용자는 "자필로 옮겨 쓰는 방법을 안내해 드릴게요"라는 문장만 보고
 *  갈 길이 없다 — 막는 것까지만 하고 대안을 주지 않는 화면이 된다 (FR-302).
 *  전 화면이 이 컴포넌트를 쓰므로 여기 한 곳이면 모든 대체 경로가 살아난다. */
export function ErrorNote({
  error,
}: {
  error: { message: string; nextAction: string; route?: string | null } | null;
}) {
  if (!error) return null;
  return (
    <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900">
      <p>{error.message}</p>
      {error.route ? (
        // 같은 문장을 안내문과 버튼에 두 번 쓰지 않는다 — 갈 곳이 있으면 그것이 곧 안내다
        <Link
          href={error.route}
          className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-rose-900 px-5 text-stone-50 transition hover:bg-rose-800"
        >
          {error.nextAction}
        </Link>
      ) : (
        <p className="mt-1 font-medium">{error.nextAction}</p>
      )}
    </div>
  );
}
