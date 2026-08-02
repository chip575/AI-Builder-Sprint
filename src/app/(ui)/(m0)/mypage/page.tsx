// S-MYPAGE · 내 정보 (FR-501 · NFR-714)
//
// 여기 값은 **계약서에 인쇄된다.** 그래서 화면이 두 가지를 분명히 해야 한다:
//   ① 비워 두면 무엇이 대신 들어가는지 — 빈칸으로 서명되는 일은 없다는 것
//   ② 이미 서명된 문서는 바뀌지 않는다는 것 — 여기를 고쳐도 과거는 그대로다
//
// 연락처를 대화가 아니라 폼으로 받는 이유: 발화는 원문 저장되고 다음 턴부터 LLM
// 프롬프트에 통째로 들어간다 (보안 1조·2조). 폼은 그 경로를 타지 않는다.
"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorNote, Notice, PrimaryButton, Shell } from "@/app/(ui)/_components/Shell";
import { NavSidebarPanel, NavSidebarToggle } from "@/app/(ui)/_components/NavSidebar";

interface Profile {
  email: string;
  displayName: string | null;
  contact: string | null;
  orgName: string | null;
}

export default function MyPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [contact, setContact] = useState("");
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const load = useCallback(async () => {
    const body = await fetch("/api/me").then((r) => r.json());
    if (!body.ok) return setError(body.error);
    setProfile(body.data);
    setDisplayName(body.data.displayName ?? "");
    setContact(body.data.contact ?? "");
    setOrgName(body.data.orgName ?? "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const body = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, contact, orgName }),
    }).then((r) => r.json());
    setBusy(false);
    if (!body.ok) return setError(body.error);
    setProfile(body.data);
    setSaved(true);
  }

  const emailLocal = profile?.email.split("@")[0] ?? "";

  return (
    <Shell
      title="내 정보"
      fr={["FR-501"]}
      headerBar={{
        leading: <NavSidebarToggle open={navOpen} onToggle={() => setNavOpen((v) => !v)} />,
      }}
    >
      <NavSidebarPanel open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="space-y-5">
        <p className="text-stone-500">
          약정서에 들어갈 내용입니다. 서명하실 때마다 다시 적지 않으셔도 됩니다.
        </p>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-500">로그인 계정</p>
          <p className="mt-1 text-stone-900">{profile?.email ?? "불러오는 중…"}</p>
        </div>

        <div>
          <label className="block text-sm text-stone-500" htmlFor="displayName">
            성명
          </label>
          <input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={emailLocal}
            className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-500"
          />
          {/* 비웠을 때 무엇이 들어가는지 미리 말한다 — 서명 뒤에 알면 늦다 */}
          <p className="mt-1 text-sm text-stone-500">
            비워 두시면 <strong>{emailLocal}</strong>(으)로 인쇄됩니다.
          </p>
        </div>

        <div>
          <label className="block text-sm text-stone-500" htmlFor="contact">
            연락처
          </label>
          <input
            id="contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={profile?.email ?? ""}
            className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-500"
          />
          <p className="mt-1 text-sm text-stone-500">
            비워 두시면 위 이메일이 연락처로 인쇄됩니다.
          </p>
        </div>

        <div>
          <label className="block text-sm text-stone-500" htmlFor="orgName">
            자주 쓰는 기관
          </label>
          <input
            id="orgName"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="예: 부산 지역아동센터"
            className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-500"
          />
          <p className="mt-1 text-sm text-stone-500">
            대화에서 기관을 말씀하시면 그쪽이 먼저 쓰입니다.
          </p>
        </div>

        <ErrorNote error={error} />
        {saved && <p className="text-sm text-stone-600">저장했습니다.</p>}

        <PrimaryButton onClick={() => void save()} disabled={busy}>
          {busy ? "저장 중…" : "저장하기"}
        </PrimaryButton>

        <Notice>
          이미 서명이 끝난 문서는 바뀌지 않습니다. 여기서 고치신 내용은 앞으로 만드실
          약정서부터 반영됩니다.
        </Notice>
      </div>
    </Shell>
  );
}
