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

const rows = [];
for (const code of Object.keys(TEMPLATE_LABELS)) {
  const id = templateIdFor(code);
  if (!id) {
    rows.push({ code, status: "ID 없음", detail: `MODUSIGN_TEMPLATE_${code} 미설정` });
    continue;
  }

  const { data, error } = await fetchTemplate(id);
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

  const ours = new Set(Object.values(TEMPLATE_LABELS[code]));
  const missing = [...ours].filter((l) => !actual.has(l)); // 우리에만 있음 = 죽은 라벨
  const extra = [...actual].filter((l) => !ours.has(l)); // 콘솔에만 있음 = 안 채우는 칸

  rows.push({
    code,
    status: missing.length === 0 ? (extra.length === 0 ? "일치" : "초과 있음") : "불일치",
    detail:
      (missing.length ? `죽은 라벨 ${missing.length}: ${missing.join(",")} ` : "") +
      (extra.length ? `미사용 ${extra.length}: ${extra.join(",")}` : ""),
  });
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

const bad = rows.filter((r) => r.status === "불일치").length;
console.log(
  `\n${rows.filter((r) => r.status === "일치").length}/${rows.length} 일치 · 불일치 ${bad}`,
);
if (bad > 0) {
  console.error("[verify] ⚠ 죽은 라벨이 있습니다. 그대로 보내면 서면에 빈칸이 인쇄됩니다.");
  process.exit(1);
}
