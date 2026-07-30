// 실 API 스모크 — UPSTAGE_MODE=real에서 Solar 대화·구조화가 실제로 도는지 1회 확인.
// 비용이 드는 호출이므로 최소 횟수만 돈다 (02.5 §5 비용 가드).
const base = process.env.E2E_BASE ?? "http://localhost:3000";
const j = (b) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(b),
});
const fail = (m) => {
  console.error("SMOKE FAIL:", m);
  process.exit(1);
};

// 1. 대화 — 첫 토큰까지 시간을 직접 잰다 (NFR-702: 2초)
const t0 = Date.now();
let res = await fetch(base + "/api/session/message", j({ text: "부산에 기부하고 싶어요" }));
if (res.status !== 200) fail("session " + res.status);

const reader = res.body.getReader();
const decoder = new TextDecoder();
let raw = "";
let firstTokenMs = null;
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  raw += decoder.decode(value, { stream: true });
  if (firstTokenMs === null && raw.includes("event: token")) firstTokenMs = Date.now() - t0;
}
const meta = JSON.parse([...raw.matchAll(/^data: (.*)$/gm)].at(-1)[1]);
const text = [...raw.matchAll(/^event: token\ndata: (.*)$/gm)]
  .map((m) => JSON.parse(m[1]))
  .join("");
if (text.length < 5) fail("응답이 비었다");
console.log(`1. Solar 대화 ok — 첫 토큰 ${firstTokenMs}ms ${firstTokenMs <= 2000 ? "(NFR-702 충족)" : "⚠ 2초 초과"}`);
console.log("   응답:", text.replace(/\s+/g, " ").slice(0, 400));
console.log("   Express:", meta.expressBranch?.branchType ?? "없음(축)");

// 2. 금액 발화 후 구조화 — Solar structured output 실호출
res = await fetch(base + "/api/session/message", j({ sessionId: meta.sessionId, text: "한 십만원쯤 생각해요" }));
if (res.status !== 200) fail("session2 " + res.status);
await res.text();

res = await fetch(base + "/api/extract", j({ intentId: meta.sessionId }));
const body = await res.json();
if (!body.ok) fail("extract " + res.status + " " + JSON.stringify(body.error));
const facts = body.data.facts.map((f) => `${f.key}=${f.value}(${f.confidence})`).join(", ");
console.log("2. Solar 구조화 ok —", facts || "(추출값 없음)");
if (body.data.facts.length === 0) console.log("   ⚠ 추출값이 없다 — 프롬프트·스키마 점검 필요");

console.log("\nSMOKE PASS — Solar 대화·구조화 실호출 확인");
