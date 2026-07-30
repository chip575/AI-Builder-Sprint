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
res = await fetch(base + `/api/evidence/${draftId}`);
body = await res.json();
if (res.status !== 200) fail("evidence " + res.status + " " + JSON.stringify(body));
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
// fact가 하나도 없으면 게이트 이전(미확정)에서 막혀 게이트를 못 태운다
await fetch(base + "/api/session/message", j({ sessionId: willSid, text: "부산에 살고 있어요" }));
await fetch(base + "/api/extract", j({ intentId: willSid }));
await fetch(base + "/api/facts/confirm", j({ intentId: willSid }));
res = await fetch(base + "/api/documents", j({ intentId: willSid }));
body = await res.json();
if (res.status !== 403 || body.error.code !== "GATE_ESIGN_INVALID")
  fail("유언 문서 생성이 차단되지 않음: " + res.status);
if (!body.error.message.includes("민법")) fail("조문 인용 없음");
console.log("13. GATE 차단 ok — 유언장 403 ·", body.error.message.match(/민법 §\d+/)?.[0]);

// 14. 카운터 정직성 — 문서 생성 단계 거부는 '서명 시도 차단'이 아니다
res = await fetch(base + "/api/admin/gate-stats");
const gate = (await res.json()).data;
if (gate.blockedTotal !== blockedBefore) fail("문서 생성 거부가 차단으로 집계됨(지표 부풀림)");
if (!(gate.byVerdict.ESIGN_INVALID > 0)) fail("판정 분포에 기록되지 않음");
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
// 정책 거부는 장애가 아니다 — 게이트 차단·미확정 403이 fail로 새면 안 된다
const draftStage = pipe.stages.find((s) => s.stage === "DRAFT");
if (draftStage.fail !== draftFailBefore)
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
