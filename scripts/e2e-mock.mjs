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

// 4. 미확정 문서 생성 → 403 (P1)
res = await fetch(base + "/api/documents", j({ intentId: sid }));
if (res.status !== 403) fail("미확정 403 아님: " + res.status);
console.log("4. 미확정 문서 생성 403 ok (P1)");

// 5. 확정
res = await fetch(base + "/api/facts/confirm", j({ intentId: sid }));
body = await res.json();
if (res.status !== 200) fail("confirm " + res.status);
console.log("5. confirm ok —", body.data.confirmedCount, "facts");

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
  res = await fetch(base + "/api/dev/webhook-sim", j({ docId: doc.documentId, event: "document_completed" }));
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

console.log("\nE2E PASS — 발화→구조화→확정→게이트→초안→서명→웹훅→증빙 관통 (키 없이)");
