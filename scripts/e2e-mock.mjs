// mock E2E — 발화→구조화→확정→게이트→초안→서명→웹훅→증빙 관통 (키 없이, NFR-707)
// 사용: pnpm dev 띄운 뒤 `pnpm e2e` (또는 node scripts/e2e-mock.mjs)
const base = process.env.E2E_BASE ?? "http://localhost:3000";
const j = (b) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(b),
});
const fail = (m) => {
  console.error("E2E FAIL:", m);
  process.exit(1);
};

// ⚠ 실과금 가드 — 이 스크립트는 대화를 여러 턴 돌린다. UPSTAGE_MODE=real이면
//   턴마다 실제 요금이 나간다. 실제로 프론트 점검 한 번에 5턴이 과금됐다 (2026-08-01).
//   dev 서버가 어떤 모드로 떴는지는 .env가 정한다 — 여기서 그걸 읽어 먼저 막는다.
//   의도적으로 실호출을 확인하려면 E2E_ALLOW_REAL=1 을 붙인다.
{
  const { readFileSync } = await import("node:fs");
  // ⚠ **.env.local이 .env를 덮는다** (Next 규칙, lib/observability/mode.ts도 같은 말을 한다).
  //   .env만 읽으면 .env.local에 real이 들어 있을 때 "mock이다"라고 잘못 안심시킨다 —
  //   가드가 조용히 틀리는 쪽으로 실패한다. 우선순위 순서대로 먼저 찾은 값을 쓴다.
  const read = (k) => {
    for (const file of [".env.local", ".env"]) {
      try {
        const v = readFileSync(file, "utf-8")
          .match(new RegExp(`^[ \\t]*${k}[ \\t]*=[ \\t]*([^\\r\\n]*)`, "m"))?.[1]
          ?.trim();
        if (v) return v;
      } catch {
        /* 파일이 없을 수 있다 */
      }
    }
    return undefined;
  };
  const mode = process.env.UPSTAGE_MODE ?? read("UPSTAGE_MODE") ?? "mock";
  if (mode === "real" && process.env.E2E_ALLOW_REAL !== "1") {
    console.error(
      "E2E 중단: UPSTAGE_MODE=real 입니다. 이 스크립트는 대화를 여러 턴 돌려 실과금됩니다.\n" +
        "  .env에서 UPSTAGE_MODE=mock 으로 바꾸거나, 알고 하는 것이면 E2E_ALLOW_REAL=1 을 붙이세요.",
    );
    process.exit(1);
  }
}

// ── 로그인 ──
// 인증이 켜진 환경(Supabase 키 있음)에서는 비로그인에 신원이 없다 — 첫 요청부터 401이다.
// 키 없는 채점 경로에서는 /api/auth/*가 503 AUTH_DISABLED를 주고 그대로 진행한다 (NFR-707).
//
// ⚠ 비밀번호를 스크립트에 적지 않는다 (보안 6조). .env의 E2E_EMAIL·E2E_PASSWORD를 읽는다.
let COOKIE = "";
const rawFetch = globalThis.fetch;
globalThis.fetch = (url, init = {}) =>
  COOKIE
    ? rawFetch(url, { ...init, headers: { ...(init.headers ?? {}), cookie: COOKIE } })
    : rawFetch(url, init);

{
  const { readFileSync } = await import("node:fs");
  const read = (k) => {
    for (const file of [".env.local", ".env"]) {
      try {
        const v = readFileSync(file, "utf-8")
          .match(new RegExp(`^[ \t]*${k}[ \t]*=[ \t]*([^\r\n]*)`, "m"))?.[1]
          ?.trim();
        if (v) return v;
      } catch {
        /* 파일이 없을 수 있다 */
      }
    }
    return undefined;
  };
  const email = process.env.E2E_EMAIL ?? read("E2E_EMAIL");
  const password = process.env.E2E_PASSWORD ?? read("E2E_PASSWORD");

  if (email && password) {
    const res = await rawFetch(base + "/api/auth/login", j({ email, password }));
    if (res.status === 200) {
      COOKIE = (res.headers.getSetCookie?.() ?? [])
        .map((c) => c.split(";")[0])
        .join("; ");
      console.log("0. LOGIN ok");
    } else if (res.status === 503) {
      console.log("0. LOGIN 생략 — 인증 비활성 환경 (NFR-707)");
    } else {
      fail(`로그인 실패 ${res.status} — E2E_EMAIL·E2E_PASSWORD를 확인하세요`);
    }
  } else {
    // 자격이 없으면 그냥 진행한다. 인증이 켜진 서버라면 아래 첫 단계에서 401로 막히고,
    // 그때 무엇을 해야 하는지 이 메시지가 알려준다
    console.log("0. LOGIN 생략 — .env에 E2E_EMAIL·E2E_PASSWORD가 없습니다");
  }
}

// 1. 대화 시작 (Express)
let res = await fetch(base + "/api/session/message", j({ text: "부산에 기부하고 싶어요" }));
if (res.status !== 200) fail("session " + res.status);
let meta = JSON.parse([...(await res.text()).matchAll(/^data: (.*)$/gm)].at(-1)[1]);
if (meta.expressBranch?.branchType !== "DONATION_NOW") fail("express 미감지");
const sid = meta.sessionId;
console.log("1. CONVERSE ok — express:", meta.expressBranch.branchType);

// 2. 금액 발화
res = await fetch(base + "/api/session/message", j({ sessionId: sid, text: "100만원이요" }));
if (res.status !== 200) fail("session2 " + res.status);
console.log("2. 금액 발화 ok");

// 3. 추출
res = await fetch(base + "/api/extract", j({ intentId: sid }));
let body = await res.json();
if (res.status !== 200) fail("extract " + res.status);
const amount = body.data.facts.find((f) => f.key === "amount");
if (amount?.value !== 1000000) fail("amount 추출 실패");
console.log("3. EXTRACT ok —", body.data.facts.map((f) => `${f.key}=${f.value}`).join(", "));

// 3.5 확인 화면(S3) 조회 — extract 재호출이 아니다
res = await fetch(base + `/api/facts?intentId=${sid}`);
body = await res.json();
if (!body.ok) fail("facts GET " + res.status);
if (body.data.confirmedAt !== null) fail("확정 전인데 confirmedAt이 있다");
if (!body.data.deduction || body.data.deduction.deductionAmount !== 276000)
  fail("세액공제 검산 불일치: " + JSON.stringify(body.data.deduction));
console.log("3.5 FACTSHEET ok — 예상공제", body.data.deduction.deductionAmount, "· 미확정");

// 정책 거부가 장애로 새는지 보려면 이번 실행분 증가만 봐야 한다 (DB는 영속)
const draftFailBefore = (await (await fetch(base + "/api/admin/pipeline-stats")).json())
  .data.stages.find((s) => s.stage === "DRAFT").fail;

// 4. 미확정 문서 생성 → 403 (P1)
res = await fetch(base + "/api/documents", j({ intentId: sid }));
if (res.status !== 403) fail("미확정 403 아님: " + res.status);
console.log("4. 미확정 문서 생성 403 ok (P1)");

// 5. 확정
res = await fetch(base + "/api/facts/confirm", j({ intentId: sid }));
body = await res.json();
if (res.status !== 200) fail("confirm " + res.status);
console.log("5. confirm ok —", body.data.confirmedCount, "facts");

// 5.5 답례품(S4) — 목록 + 한도 + 초과 거부
res = await fetch(base + "/api/rewards");
const rewards = (await res.json()).data;
res = await fetch(base + "/api/rewards/select", j({ rewardIds: [], amount: 1000000 }));
body = await res.json();
if (!body.ok || body.data.remaining !== 300000) fail("답례품 한도 불일치: " + JSON.stringify(body.data));
const over = rewards.slice(0, 3).map((r) => r.id);
res = await fetch(base + "/api/rewards/select", j({ rewardIds: over, amount: 100000 }));
if (res.status !== 422) fail("한도 초과가 거부되지 않음: " + res.status);
console.log("5.5 REWARDS ok — 한도 300,000원 · 초과 조합 422 거부");

// 6. 문서 생성
res = await fetch(base + "/api/documents", j({ intentId: sid }));
body = await res.json();
if (res.status !== 200) fail("documents " + res.status + " " + JSON.stringify(body));
const draftId = body.data.draftId;
console.log("6. DRAFT ok —", draftId);

// 7. 서명 요청 (LINK)
res = await fetch(base + `/api/sign/${draftId}`, j({ mode: "LINK" }));
body = await res.json();
if (res.status !== 200 || !body.data.signUrl) fail("sign " + res.status);
console.log("7. SIGN 요청 ok — 만료:", body.data.expiresAt);

// 8. mock 외부 문서 ID 조회 (dev 도구)
res = await fetch(base + "/api/dev/documents");
body = await res.json();
const doc = body.data.find((d) => d.draftId === draftId);
if (!doc) fail("mock 문서 못 찾음");
console.log("8. 외부 문서 ok —", doc.documentId, doc.status);

// 9. 서명 완료 시뮬 → 실제 웹훅 경로 (멱등 확인 위해 2회)
for (let i = 0; i < 2; i++) {
  res = await fetch(base + "/api/dev/webhook-sim", j({ docId: doc.documentId, event: "document_all_signed" }));
  if (res.status !== 200) fail("webhook-sim " + res.status);
}
console.log("9. 완료 웹훅 x2 ok (멱등)");

// 10. 상태 폴링 → COMPLETED
res = await fetch(base + `/api/sign/${draftId}/status`);
body = await res.json();
if (body.data.status !== "COMPLETED") fail("status != COMPLETED: " + body.data.status);
console.log("10. STATUS ok — COMPLETED,", body.data.completedAt);

// 11. 증빙 조회 → 해시 + 15분 만료 URL
// 아웃박스가 비동기라 완료 직후엔 아직 없을 수 있다 — 화면과 같은 방식으로 기다린다
for (let i = 0; i < 8; i++) {
  res = await fetch(base + `/api/evidence/${draftId}`);
  body = await res.json();
  if (body.ok) break;
  await new Promise((r) => setTimeout(r, 700));
}
if (!body.ok) fail("evidence 준비 안 됨 " + JSON.stringify(body));
if (!/^[0-9a-f]{64}$/.test(body.data.hash)) fail("해시 형식 이상");
console.log("11. EVIDENCE ok — hash:", body.data.hash.slice(0, 16) + "…");

// 12. 만료형 URL로 PDF 다운로드
res = await fetch(body.data.pdfUrl);
if (res.status !== 200) fail("pdf " + res.status);
const pdf = await res.text();
if (!pdf.startsWith("%PDF")) fail("PDF 본문 이상");
console.log("12. PDF ok —", res.headers.get("Content-Type"));

// 13. 게이트 차단 (FR-104) — 데모 장면의 자동 검증
res = await fetch(base + "/api/admin/gate-stats");
const blockedBefore = (await res.json()).data.blockedTotal;

res = await fetch(base + "/api/session/message", j({ text: "유언장을 준비하고 싶어요" }));
meta = JSON.parse([...(await res.text()).matchAll(/^data: (.*)$/gm)].at(-1)[1]);
if (meta.expressBranch?.branchType !== "HANDWRITTEN_WILL") fail("유언 가지 미감지");
const willSid = meta.sessionId;
// **발화 하나로 바로 문서 생성을 시도한다.** 예전에는 fact를 억지로 만들어 넣었는데
// (지역·금액을 말하게 해서), 그건 게이트를 태우기 위한 우회였고 실제 사용자는 그렇게
// 말하지 않는다. 게이트가 확정 검사보다 앞에 있으므로 이제 우회가 필요 없다 —
// 이 단계가 곧 "UI 경로에서 유언 차단이 실제로 발생하는가"의 검사다
res = await fetch(base + "/api/documents", j({ intentId: willSid }));
body = await res.json();
if (res.status !== 403 || body.error.code !== "GATE_ESIGN_INVALID")
  fail("유언 문서 생성이 차단되지 않음: " + res.status);
if (!body.error.message.includes("민법")) fail("조문 인용 없음");
console.log("13. GATE 차단 ok — 유언장 403 ·", body.error.message.match(/민법 §\d+/)?.[0]);
if (!body.error.route?.includes("/will/handwriting")) fail("자필 가이드 경로 미제시");

// 13.5 필사 가이드 (FR-302) — 차단의 목적지. 서명할 방법이 없다는 것이 산출물이다
res = await fetch(base + `/api/will/draft/${willSid}/print`);
body = await res.json();
if (!body.ok) fail("필사 가이드 " + res.status + " " + JSON.stringify(body.error));
const g = body.data;
if (g.checklist.length !== 4) fail("체크리스트 4항목 아님");
if (!g.draftText.includes("(인)")) fail("날인 자리 없음");
if (!g.statutes.some((s) => s.id === "민법 §1066")) fail("§1066 미인용");
if (JSON.stringify(g).match(/signUrl|embedUrl|modusign/)) fail("서명 필드가 존재한다");
console.log("13.5 필사 가이드 ok — 4항목 · 서명 필드 부재 · §1066 인용");

// 14. 카운터가 UI 경로에서 실제로 오르는가 (2026-08-01 규칙 변경)
//
// 각 부분은 정상인데 조합이 안 되던 종류라 유닛으로는 영영 안 잡힌다:
// 게이트도 맞고 카운터도 맞았는데, 집계가 wasSignAttempt를 요구하고
// documents가 그보다 먼저 막아서 **UI 경로로는 도달할 수 없는 조건**이었다.
// 실측 판정 11건 · 표시 0건. 그 조합을 지키는 것은 이 한 단계뿐이다.
res = await fetch(base + "/api/admin/gate-stats");
const gate = (await res.json()).data;
if (gate.blockedTotal <= blockedBefore)
  fail(`UI 경로 차단이 카운터에 안 잡힘: ${blockedBefore} → ${gate.blockedTotal}`);
if (!(gate.byVerdict.ESIGN_INVALID > 0)) fail("판정 분포에 기록되지 않음");
if (!gate.byStatute.some((s) => s.id === "민법 §1066")) fail("조문별 분포에 §1066 없음");
// 반대편 — NON_BINDING까지 삼키면 지표가 부풀려진다. 기부(ESIGN_OK)는 차단이 아니다
if (gate.blockedTotal >= gate.totalEvaluations)
  fail("모든 판정이 차단으로 집계됨 — 3분기가 구분되지 않는다");
console.log("14. COUNTER ok — 차단", gate.blockedTotal, "· 전체 판정", gate.totalEvaluations);

// 15. 파이프라인 지표 (NFR-709) — 수치는 환경 따라 변하므로 **존재**만 검증한다
res = await fetch(base + "/api/admin/pipeline-stats");
const pipe = (await res.json()).data;
const silent = pipe.stages.filter((s) => s.success + s.fail === 0).map((s) => s.stage);
if (silent.length > 0) fail("기록이 없는 단계: " + silent.join(", "));
const conv = pipe.stages.find((s) => s.stage === "CONVERSE");
if (conv.p95Ms === null) fail("CONVERSE 첫 토큰 시간이 기록되지 않음");
console.log(
  "15. METRICS ok — 6단계 전부 기록 ·",
  pipe.totalRecords + "건 · 첫 토큰 p95",
  conv.p95Ms + "ms",
);
// 정책 거부는 장애가 아니다 — 게이트 차단·미확정 403이 fail로 새면 안 된다.
// ⚠ **같기를 요구하지 않는다.** 지표는 최근 1000건 창이라(PostgREST db-max-rows)
//   새 기록이 쌓이면 옛 기록이 창 밖으로 밀려 fail이 **줄어들 수 있다.**
//   우리가 잡으려는 것은 "이번 실행에서 정책 거부가 fail로 샜는가" = 증가 여부다.
const draftStage = pipe.stages.find((s) => s.stage === "DRAFT");
if (draftStage.fail > draftFailBefore)
  fail(`정책 거부가 장애(fail)로 집계됨: +${draftStage.fail - draftFailBefore}`);

// 16. 리컨실러 (FR-504) — 응답 형식 + 멱등. 상태 대조가 실제로 도는지
res = await fetch(base + "/api/cron/reconcile?staleMs=0", { method: "POST" });
const rec = (await res.json()).data;
if (typeof rec.corrected !== "number" || !rec.lastSyncAt) fail("리컨실 응답 형식 이상");
res = await fetch(base + "/api/cron/reconcile");
const recState = (await res.json()).data;
if (!recState.lastSyncAt) fail("마지막 동기화 시각이 기록되지 않음");
console.log(
  "16. RECONCILE ok — 이번 교정",
  rec.corrected + "건 · 누적",
  recState.correctedTotal + "건",
);

console.log("\nE2E PASS — 발화→구조화→확정→게이트→초안→서명→웹훅→증빙 + 게이트 차단 카운터 (키 없이)");
