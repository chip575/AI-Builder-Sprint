// S1 · 로그인 (auth/LoginPage · 02.4 §1)
// 키 없는 환경에서는 인증이 비활성이라 이 화면이 벽이 되지 않는다 (NFR-707).
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ErrorNote, PrimaryButton, Shell } from "../_components/Shell";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/chat";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    setBusy(false);

    // 인증 비활성(키 없음) — 로그인 없이 그대로 진행한다
    if (!body.ok && body.error.code === "AUTH_DISABLED") {
      router.push(next);
      return;
    }
    if (!body.ok) return setError(body.error);
    router.push(next);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-stone-600">
        남기신 내용을 다음에도 이어서 보시려면 계정이 필요합니다.
      </p>

      <div>
        <label className="block text-sm text-stone-500" htmlFor="email">
          이메일
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-500"
        />
      </div>

      <div>
        <label className="block text-sm text-stone-500" htmlFor="password">
          비밀번호 (8자 이상)
        </label>
        <input
          id="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-500"
        />
      </div>

      <ErrorNote error={error} />

      <PrimaryButton type="submit" disabled={busy || !email || password.length < 8}>
        {mode === "login" ? "로그인" : "가입하고 시작하기"}
      </PrimaryButton>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError(null);
        }}
        className="min-h-11 w-full text-sm text-stone-500"
      >
        {mode === "login" ? "처음이신가요? 가입하기" : "이미 계정이 있어요"}
      </button>
    </form>
  );
}

export default function AuthPage() {
  return (
    <Shell title="시작하기" fr={["FR-auth"]}>
      <Suspense fallback={<p className="text-stone-500">불러오는 중…</p>}>
        <LoginForm />
      </Suspense>
    </Shell>
  );
}
