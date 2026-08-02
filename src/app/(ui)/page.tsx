// 진입 화면 — 관리하기(/estate)가 대문이다 (2026-08-02 팀 피벗).
//
// 문을 하나로 줄였다. 작성실(/write)과 회상(/chat)은 지우지 않았고 /estate 안에
// 각각의 자리가 있다 — 대문에 문을 셋 세우면 그게 곧 트랙 선택이 된다 (FR-110).
//
// FR-110 주의: 여기서 금지된 것은 **진입 시 트랙·카테고리 선택**이다.
// 문서 선택은 /write 안에서 일어난다 — 그 긴장 관계는 PM 검토 대상으로 남긴다 (PR #5).
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6">
      {/* 이 화면은 Shell을 쓰지 않으므로 제목 명조가 자동으로 오지 않는다 — 직접 건다 */}
      <h1 className="text-center font-serif text-3xl font-semibold leading-relaxed">
        남기실 것들, 여기서 돌봅니다
      </h1>
      {/* 정체성은 관리다 — 자산은 시간이 지나며 바뀌고, 남긴 뜻은 때가 되면 되짚는다.
          서류 작성은 그 관리 중에 일어나는 행위라 대문이 아니라 안쪽 문이다 (2026-08-02) */}
      {/* 두 문장을 각 줄에 둔다 — 하나는 무엇을 하는지, 하나는 어떻게 하는지다 */}
      <p className="text-center font-serif text-stone-500">
        자산과 남기신 뜻을 시간이 지나도 관리합니다.
        <br />
        서명은 법이 인정하는 방식으로만 합니다.
      </p>
      <Link
        href="/estate"
        className="rounded-full bg-ink px-8 py-3 text-stone-50 transition hover:bg-ink-hover"
      >
        내 유산 정리 시작하기
      </Link>
      {/* 작성실·회상으로 가는 문은 /estate 안에 있다 — 대문에서는 하나만 연다 */}
      {/* 안내문은 stone-400이면 2.48:1로 못 읽힌다 — 500(4.58:1)으로 올린다 */}
      <p className="text-sm text-stone-500">
        언제든 멈출 수 있고, 저장된 곳부터 다시 이어집니다.
      </p>
      {/* FR-110이 금지한 것은 **진입 시 트랙·카테고리 선택**이다. 이건 사용자 여정의
          선택지가 아니라 다른 역할(P4 기관 담당자)의 입구라 그 범주가 아니다. */}
      <Link
        href="/org"
        className="mt-4 text-sm text-stone-400 underline underline-offset-4 hover:text-stone-600"
      >
        기관 담당자이신가요?
      </Link>
    </main>
  );
}
