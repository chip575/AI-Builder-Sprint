// 화면 공통 뼈대 — 와이어프레임(02.1.1)의 규칙을 코드로 고정한다.
// · 우상단 FR 태그 배지 (명세 추적)
// · 우하단 "나중에 생각할래요" (전 화면 존재 — FR-101 · P4)
// · 접근성: 본문 16px 기준·고대비·터치 44px+ (NFR-701, P2 기준)
"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function Shell({
  title,
  fr,
  children,
  footer,
}: {
  title: string;
  /** 이 화면이 구현하는 FR — 우상단 배지 */
  fr: string[];
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 pb-32 pt-8 text-base">
      <header className="mb-6 flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold text-stone-900">{title}</h1>
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
      </header>

      <div className="flex-1">{children}</div>

      {footer ? <div className="mt-8">{footer}</div> : null}

      {/* P4 — 어떤 단계에서도 중단할 수 있다. 재촉 문구 금지 */}
      <Link
        href="/"
        className="fixed bottom-6 right-6 min-h-11 rounded-full border border-stone-300 bg-white px-5 py-3 text-sm text-stone-600 shadow-sm transition hover:bg-stone-50"
      >
        나중에 생각할래요
      </Link>
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
      className="min-h-11 w-full rounded-xl bg-stone-900 px-6 py-3 text-stone-50 transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300"
    >
      {children}
    </button>
  );
}

/** 서버 error envelope의 nextAction을 그대로 보여준다 (NFR-705 — 기술 코드 노출 금지) */
export function ErrorNote({ error }: { error: { message: string; nextAction: string } | null }) {
  if (!error) return null;
  return (
    <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900">
      <p>{error.message}</p>
      <p className="mt-1 font-medium">{error.nextAction}</p>
    </div>
  );
}
