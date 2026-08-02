// 기동 시 1회, 실제로 적용된 모드를 선언한다.
// ".env에 썼는데 왜 mock이지?"를 추측이 아니라 로그 한 줄로 판정하기 위한 것 —
// 편집한 파일과 로드된 파일이 다를 수 있다 (Next는 .env.local이 .env를 덮는다).
export function resolveModes() {
  const hasSupabase = Boolean(
    (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  return {
    data: hasSupabase ? "supabase" : "memory",
    upstage: process.env.UPSTAGE_MODE ?? "mock",
    modusign: process.env.MODUSIGN_MODE ?? "mock",
  };
}

export function logModes(): void {
  const m = resolveModes();
  console.log(
    `[mode] DATA=${m.data} UPSTAGE=${m.upstage} MODUSIGN=${m.modusign}`,
  );
  if (m.upstage === "real") {
    console.warn("[mode] ⚠ UPSTAGE=real — 실 호출이 과금됩니다 (크레딧 소진 후에도 계속)");
  }
  if (m.modusign === "real") {
    console.warn(
      "[mode] ⚠ MODUSIGN=real — 서명 요청이 실제로 나가고 잔여를 소모합니다 (조회는 무료)",
    );
  }
}
