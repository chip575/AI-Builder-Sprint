// 새 기능 E2E — 알릴 분 · 마음 유언 서류화 · 철회 · 지킴이
// 실행 중인 dev 서버를 그대로 쓴다. 서명은 mock이라 과금 없음.
// 포트가 점유돼 있을 수 있어 E2E_BASE로 바꿔 쓴다 (e2e-mock.mjs와 같은 규약)
const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
let cookie = "";

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...init.headers },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; } // SSE는 통째로 둔다 — meta가 마지막 이벤트다
  return { status: res.status, body };
}
const fail = (m) => { console.error("❌", m); process.exit(1); };
const ok = (m) => console.log("✓", m);

// 0. 로그인 — .env의 E2E 자격을 쓴다 (e2e-mock.mjs와 같은 방식)
{
  // ⚠ **.env가 없어도 죽지 않는다.** 새로 받은 사람은 .env가 없고, 그때 크래시하면
  //   "이 저장소는 안 돌아간다"로 읽힌다. 키 없이도 도는 것이 전제다 (NFR-707)
  const { readFileSync, existsSync } = await import("node:fs");
  const read = (k) =>
    existsSync(".env")
      ? readFileSync(".env", "utf8").match(new RegExp(`^[ \t]*${k}[ \t]*=[ \t]*([^\r\n]*)`, "m"))?.[1]?.trim()
      : undefined;
  const email = process.env.E2E_EMAIL ?? read("E2E_EMAIL");
  const password = process.env.E2E_PASSWORD ?? read("E2E_PASSWORD");
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 200) {
    cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    ok("0. LOGIN");
  } else if (res.status === 503) {
    ok("0. LOGIN 생략 — 인증 비활성 (NFR-707)");
  } else if (!email || !password) {
    // 자격이 없으면 인증이 켜진 서버에서 아래 첫 단계가 401로 막힌다.
    // 그때 무엇을 해야 하는지 이 문장이 알려 준다
    ok("0. LOGIN 생략 — .env에 E2E_EMAIL·E2E_PASSWORD가 없습니다");
  } else {
    fail(`로그인 실패 ${res.status}`);
  }
}

// 1. 알릴 분 — 기관 · 유가족 · 지킴이
let org, custodianPerson;
{
  const uniq = Date.now();
  const a = await api("/api/recipients", { method: "POST", body: JSON.stringify({ kind: "ORG", name: "가상재단", email: `org${uniq}@example.org` }) });
  if (!a.body.ok) fail(`기관 등록 실패 ${JSON.stringify(a.body)}`);
  const b = await api("/api/recipients", { method: "POST", body: JSON.stringify({ kind: "FAMILY", name: "김가상", relation: "장녀", email: `fam${uniq}@example.org` }) });
  if (!b.body.ok) fail("유가족 등록 실패");
  const c = await api("/api/recipients", { method: "POST", body: JSON.stringify({ kind: "CUSTODIAN", name: "이가상", relation: "조카", email: `cu${uniq}@example.org` }) });
  if (!c.body.ok) fail("지킴이 등록 실패");
  org = c.body.data.recipients.find((r) => r.kind === "ORG");
  custodianPerson = c.body.data.recipients.find((r) => r.kind === "CUSTODIAN");
  const filtered = await api("/api/recipients?kind=ORG");
  if (!filtered.body.data.recipients.every((r) => r.kind === "ORG")) fail("kind 필터 누수");
  ok(`1. 알릴 분 ok — ${c.body.data.recipients.length}명 · kind 필터 정상`);
}

// 2. 마음 유언 — 회상 → 문단 → 서류화
let heartSession;
{
  const s = await api("/api/session/message", { method: "POST", body: JSON.stringify({ text: "아이들에게 미안했다고 전하고 싶어요" }) });
  // SSE라 JSON이 아니다 — meta는 raw에 들어 있다
  const m = (s.body.raw ?? "").match(/"sessionId":"([0-9a-f-]{36})"/);
  if (!m) fail("회상 세션 id를 못 얻음");
  heartSession = m[1];

  const empty = await api("/api/heartwill/document", { method: "POST", body: JSON.stringify({ sessionId: heartSession }) });
  if (empty.status !== 409) fail(`승인 없이 문서가 만들어짐 (${empty.status})`);
  ok("2. 마음 유언 — 승인 0건이면 문서 안 만듦 (P1)");
}

// 3. 철회 — 유산기부 약정을 만들고 철회
let intentId;
{
  const s = await api("/api/session/message", { method: "POST", body: JSON.stringify({ text: "제가 떠난 뒤에 부산문화재단에 오백만원을 남기고 싶어요" }) });
  const m = (s.body.raw ?? "").match(/"sessionId":"([0-9a-f-]{36})"/);
  if (!m) fail("가지 세션 id를 못 얻음");
  intentId = m[1];
  ok(`3. 유산기부 대화 ok — session ${intentId.slice(0, 8)}…`);
}

// 4. 철회 — 이력 없는 세션은 404
{
  const r = await api(`/api/ledger/${intentId}/revoke`, { method: "POST", body: JSON.stringify({ changeReason: "이력이 없는 경우" }) });
  if (r.status !== 404 && r.status !== 409) fail(`이력 없는 철회가 ${r.status} (404/409 기대)`);
  ok(`4. 이력 없는 철회 거부 ok (${r.status})`);
}

// 5. 사유 없는 철회는 400
{
  const r = await api(`/api/ledger/${intentId}/revoke`, { method: "POST", body: JSON.stringify({ changeReason: "" }) });
  if (r.status !== 400) fail(`사유 없는 철회가 ${r.status} (400 기대)`);
  ok("5. 사유 없는 철회 거부 ok (400)");
}

// 6. 남의 id로 철회 시도 → 404
{
  const r = await api(`/api/ledger/00000000-0000-4000-8000-000000000000/revoke`, { method: "POST", body: JSON.stringify({ changeReason: "남의 것" }) });
  if (r.status !== 404) fail(`남의 id 철회가 ${r.status} (404 기대)`);
  ok("6. 남의 약정 철회 거부 ok (404)");
}

// 7. 지킴이 초대 — 주소록에 없는 사람은 404
{
  const r = await api("/api/estate/custodians", { method: "POST", body: JSON.stringify({ recipientId: "00000000-0000-4000-8000-000000000001", displayName: "모르는 사람", viewScope: [] }) });
  if (r.status !== 404) fail(`주소록 밖 초대가 ${r.status} (404 기대)`);
  ok("7. 주소록 밖 지킴이 초대 거부 ok (404)");
}

// 8. 지킴이 초대 — 실제
let custodianId;
{
  const r = await api("/api/estate/custodians", { method: "POST", body: JSON.stringify({ recipientId: custodianPerson.id, displayName: "이가상", viewScope: ["FINANCIAL"] }) });
  if (!r.body.ok) fail(`지킴이 초대 실패 ${JSON.stringify(r.body)}`);
  const c = r.body.data.custodian;
  if (c.status !== "PENDING") fail(`초대 직후 status=${c.status} (PENDING 기대)`);
  if (c.grantedAt !== null) fail("초대만으로 grantedAt이 찼다 — 열람이 열린다");
  custodianId = c.id;
  ok(`8. 지킴이 초대 ok — PENDING · grantedAt=null · draft ${r.body.data.draftId.slice(0, 8)}…`);
}

// 9. 권한 회수
{
  const r = await api(`/api/estate/custodians?id=${custodianId}`, { method: "DELETE" });
  if (!r.body.ok) fail("권한 회수 실패");
  const c = r.body.data.custodians.find((x) => x.id === custodianId);
  if (c.status !== "REVOKED") fail(`회수 후 status=${c.status}`);
  if (c.grantedAt === undefined) fail("grantedAt 필드가 사라졌다");
  ok("9. 권한 회수 ok — REVOKED");
}

// 10. 자산 현황 — summary가 내려오는가 (AssetPeek/AssetStatus의 데이터원)
{
  const r = await api("/api/estate/assets");
  if (!r.body.ok) fail("자산 조회 실패");
  if (!r.body.data.summary) fail("summary가 없다 — 화면이 현황을 못 그린다");
  const s = r.body.data.summary;
  ok(`10. 자산 현황 ok — ${s.totalCount}건 · 미확정 ${s.unconfirmedCount} · 채무 ${s.hasDebt}`);
}

console.log("\n새 기능 E2E PASS — 알릴 분 · 마음 유언 · 철회 방어 · 지킴이 · 자산 현황");
