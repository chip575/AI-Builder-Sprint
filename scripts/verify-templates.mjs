// 템플릿 대조 — 콘솔의 실제 dataLabel과 우리 표(template-labels.ts)를 맞춰 본다.
//
// 왜 필요한가: 템플릿을 다시 만들면 dataLabel이 새로 생성되고, 그때 증상은
// **에러가 아니라 조용한 빈칸**이다. 값이 안 실려 나간 채로 서명이 끝난다.
// `toDataLabel()`은 우리 표에 없는 키를 던져 잡지만, **라벨 값이 바뀐 경우는 못 잡는다.**
// 그 구멍을 메우는 것이 이 스크립트다.
//
// ⚠ 서명 요청을 절대 보내지 않는다. 조회만 한다 — 서명은 1건씩 잔여를 소모하고
//   조회는 공짜다. 왕복 전에 여기서 먼저 확인하는 것이 순서다.
//
// 사용: node scripts/verify-templates.mjs
import { readFileSync } from "node:fs";
import { TEMPLATE_LABELS, TEMPLATE_ROLES } from "../src/lib/signer/template-labels.ts";

const BASE = "https://api.modusign.co.kr";

function env(key) {
  // ⚠ `\s`는 줄바꿈을 포함한다. 값이 비어 있으면 다음 줄로 넘어가 **엉뚱한 키 이름을
  //    값으로 집는다** — 실제로 그래서 조회 URL에 키 이름이 박혔다.
  //    가로 공백만 허용하고, 빈 값은 없는 것으로 본다.
  const m = readFileSync(".env", "utf-8").match(
    new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*([^\\r\\n]*)`, "m"),
  );
  const value = m?.[1]?.trim();
  return value ? value : undefined;
}

const apiKey = process.env.MODUSIGN_API_KEY ?? env("MODUSIGN_API_KEY");
if (!apiKey) {
  console.error("[verify] MODUSIGN_API_KEY가 없습니다.");
  process.exit(1);
}

/** MODUSIGN_TEMPLATE_<코드> → 템플릿 id */
function templateIdFor(code) {
  return process.env[`MODUSIGN_TEMPLATE_${code}`] ?? env(`MODUSIGN_TEMPLATE_${code}`);
}

async function fetchTemplate(id) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch(`${BASE}/templates/${id}`, {
      headers: { Authorization: `Basic ${Buffer.from(`:${apiKey}`).toString("base64")}` },
      signal: ctl.signal,
    });
    if (!res.ok) {
      return { error: `${res.status} ${(await res.text()).slice(0, 120)}` };
    }
    return { data: await res.json() };
  } catch (err) {
    return { error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** 응답 어디에 입력란이 실려 오는지는 문서에 없다 — 흔한 자리를 훑어 모은다.
 *  못 찾으면 그 사실을 보고한다. 찾은 척하지 않는다. */
/** 요청자 입력란(우리가 채우는 칸)만 따로 뽑는다 — 서명자 칸과 성격이 다르다 */
function requesterLabels(tpl) {
  return (tpl.requesterInputs ?? []).map((x) => ({
    label: x.dataLabel ?? x.customId ?? "?",
    type: x.type,
    y: x.position?.y ?? 0,
  }));
}

function collectLabels(tpl) {
  const found = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    for (const [k, v] of Object.entries(node)) {
      if (k === "dataLabel" && typeof v === "string") found.add(v);
      else walk(v);
    }
  };
  walk(tpl);
  return found;
}

/** 조회에도 빈도 제한(429)이 있다 — 서명 잔여와는 무관하지만 몰아서 부르면 막힌다 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = [];
const dumps = [];
let first = true;
for (const code of Object.keys(TEMPLATE_LABELS)) {
  const id = templateIdFor(code);
  if (!id) {
    rows.push({ code, status: "ID 없음", detail: `MODUSIGN_TEMPLATE_${code} 미설정` });
    continue;
  }

  if (!first) await sleep(2000);
  first = false;
  let { data, error } = await fetchTemplate(id);
  if (error?.startsWith("429")) {
    await sleep(6000); // 한 번은 더 기다려 본다
    ({ data, error } = await fetchTemplate(id));
  }
  if (error) {
    rows.push({ code, status: "조회 실패", detail: error });
    continue;
  }

  const actual = collectLabels(data);
  if (actual.size === 0) {
    // 상세 조회에 입력란 정보가 없을 수 있다 — 그때는 다른 방법을 찾아야 한다
    rows.push({ code, status: "라벨 없음", detail: "응답에 dataLabel이 없습니다" });
    continue;
  }

  // 참여자별 필드 소속까지 본다 — 초과 라벨이 **다른 역할**에 붙어 있으면
  // 서명자가 늘어나 문서가 완료되지 않는다. 스크린샷 해석보다 이쪽이 정확하다
  const parts = (data.participants ?? []).map((p) => ({
    role: p.role ?? p.name ?? "?",
    order: p.signingOrder ?? null,
    count: (p.fields ?? []).length,
  }));
  const emptyRoles = parts.filter((p) => p.count === 0).map((p) => p.role);

  dumps.push({
    code,
    requester: requesterLabels(data),
    parts: (data.participants ?? []).map((p) => ({
      role: p.role ?? p.name ?? "?",
      labels: (p.fields ?? []).map((f) => `${f.type}:${f.dataLabel}`),
    })),
  });

  const ours = new Set(Object.values(TEMPLATE_LABELS[code]));
  const missing = [...ours].filter((l) => !actual.has(l)); // 우리에만 있음 = 죽은 라벨
  const extra = [...actual].filter((l) => !ours.has(l)); // 콘솔에만 있음 = 안 채우는 칸

  rows.push({
    code,
    status:
      missing.length > 0
        ? "불일치"
        : emptyRoles.length > 0
          ? "빈 역할" // 서명할 칸이 없는 참여자 — 문서가 완료되지 않는다
          : extra.length === 0
            ? "일치"
            : "초과 있음",
    detail:
      (missing.length ? `죽은 라벨 ${missing.length}: ${missing.join(",")} ` : "") +
      (emptyRoles.length ? `필드 0개 역할: ${emptyRoles.join(",")} ` : "") +
      (extra.length ? `미사용 ${extra.length} ` : "") +
      parts.map((p) => `${p.role}(${p.count})`).join(" · "),
  });
}

// --dump: 실제 라벨을 그대로 찍는다. 손으로 옮겨 적으면 59개 중 하나는 틀린다
if (process.argv.includes("--dump")) {
  console.log("");
  console.log("=== 실측 라벨 (요청자 입력란은 문서 위치 순) ===");
  for (const d of dumps) {
    console.log("");
    console.log("  " + d.code);
    if (d.requester.length === 0) {
      console.log("    (요청자 입력란 없음 - 모든 칸이 서명자 입력이다)");
    }
    for (const f of d.requester.sort((a, b) => a.y - b.y)) {
      console.log("    " + f.label.padEnd(14) + f.type.padEnd(10) + "y=" + f.y.toFixed(4));
    }
    for (const p of d.parts) {
      console.log("    [서명자 " + p.role + "] " + p.labels.join(" "));
    }
  }
}
console.log("\n서식      상태        내용");
console.log("─".repeat(78));
for (const r of rows) {
  console.log(`${r.code.padEnd(20)} ${r.status.padEnd(10)} ${r.detail ?? ""}`);
}

console.log("\n역할 (콘솔 값과 한 글자라도 다르면 요청이 거부된다)");
for (const [code, roles] of Object.entries(TEMPLATE_ROLES)) {
  console.log(`  ${code.padEnd(20)} ${roles.join(" → ")}`);
}

const bad = rows.filter((r) => r.status === "불일치" || r.status === "빈 역할").length;
console.log(
  `\n${rows.filter((r) => r.status === "일치").length}/${rows.length} 일치 · 불일치 ${bad}`,
);
if (bad > 0) {
  console.error(
    "[verify] ⚠ 죽은 라벨 또는 빈 역할이 있습니다. 죽은 라벨은 서면에 인쇄되지 않고, " +
      "빈 역할은 그 참여자가 서명할 칸이 없어 문서가 완료되지 않습니다.",
  );
  process.exit(1);
}
