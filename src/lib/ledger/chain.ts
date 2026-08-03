// M-LEDGER 순수 로직 — 해시 체인·실질성 판정·최신성 유도 (FR-551~555).
//
// 여기에는 저장소도 시각도 난수도 없다. 원장의 신뢰성 주장("한 바이트만 바뀌어도
// 이후 전부 불일치")은 **재계산 가능한 순수 함수**일 때만 증거가 된다 —
// 검증자가 우리 DB를 믿지 않아도 같은 입력으로 같은 해시를 얻을 수 있어야 한다.
import { createHash } from "node:crypto";
import type {
  LedgerNode,
  LedgerNodeStatus,
  Materiality,
} from "../contracts/ledger";

/** 해시에 봉인되는 필드. status는 **의도적으로 빠져 있다** —
 *  최신성은 유도값이라 나중에 SUPERSEDED로 바뀐다. 봉인하면 체인이 스스로 깨진다. */
const SEALED = [
  "subjectId",
  "seq",
  "materiality",
  "changeSummary",
  "changeReason",
  "conditionNote",
  "witness",
  "draftId",
  "createdAt",
] as const;

/** 키 정렬 직렬화. JSON.stringify는 키 순서를 입력에 맡기므로 그대로 쓰면
 *  같은 내용이 다른 해시를 낳는다 (jsonb 왕복 후 순서가 바뀌는 게 대표적). */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      // 코드포인트 비교 — localeCompare는 로케일에 따라 결과가 달라진다
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

type SealedNode = Pick<LedgerNode, (typeof SEALED)[number]>;

/** 직전 해시 + 노드 내용 → sha256. 첫 노드의 prevHash는 null이다. */
export function computeNodeHash(
  node: SealedNode,
  prevHash: string | null,
): string {
  const body: Record<string, unknown> = { prevHash: prevHash ?? null };
  for (const k of SEALED) body[k] = node[k] ?? null;
  return createHash("sha256").update(canonicalize(body), "utf8").digest("hex");
}

export interface NodeSeed extends Omit<SealedNode, "seq" | "createdAt"> {
  materiality: Materiality;
}

/** 꼬리 노드에 이어 붙일 새 노드를 만든다. id·createdAt은 호출자(어댑터)가 준다 —
 *  이 파일이 시각·난수를 만들면 같은 입력이 같은 해시를 내지 않게 된다. */
export function buildNode(
  prev: LedgerNode | undefined,
  seed: NodeSeed & { status?: LedgerNodeStatus },
  stamp: { id: string; createdAt: string },
): LedgerNode {
  const sealed: SealedNode = {
    subjectId: seed.subjectId,
    seq: (prev?.seq ?? 0) + 1,
    materiality: seed.materiality,
    changeSummary: seed.changeSummary,
    changeReason: seed.changeReason,
    conditionNote: seed.conditionNote ?? null,
    witness: seed.witness ?? null,
    draftId: seed.draftId ?? null,
    createdAt: stamp.createdAt,
  };
  const prevHash = prev?.nodeHash ?? null;
  return {
    ...sealed,
    id: stamp.id,
    prevHash,
    nodeHash: computeNodeHash(sealed, prevHash),
    // 저장값. 읽을 때 withDerivedStatus가 다시 판정한다.
    // 철회만 **쌓을 때 정해진다** — 원장은 append-only라(NFR-704) 지난 노드를
    // 고칠 수 없기 때문이다. 철회 노드 하나가 체인 전체를 닫는다
    status: seed.status ?? "ACTIVE",
  };
}

/** 체인 검증 — seq 연속성 · prevHash 연결 · 해시 재계산 일치.
 *  하나라도 어긋나면 false다. 중간 노드가 1바이트 바뀌면 그 노드의 재계산 해시가
 *  달라지고, 다음 노드의 prevHash가 가리키던 값과도 어긋나 이후 전부 불일치한다. */
export function verifyChain(nodes: LedgerNode[]): boolean {
  if (nodes.length === 0) return true; // 빈 원장은 위조된 바 없다
  const ordered = [...nodes].sort((a, b) => a.seq - b.seq);
  let prevHash: string | null = null;
  for (let i = 0; i < ordered.length; i += 1) {
    const node = ordered[i]!;
    // 빈 번호는 "지워진 노드가 있다"는 뜻이다 — append-only 위반
    if (node.seq !== i + 1) return false;
    if ((node.prevHash ?? null) !== prevHash) return false;
    if (computeNodeHash(node, prevHash) !== node.nodeHash) return false;
    prevHash = node.nodeHash;
  }
  return true;
}

/** FR-552 실질성 등급. 재서명을 요구할지가 여기서 갈린다.
 *  MATERIAL 수증자·배분비율·기부처·기부액·Custodian → 재서명
 *  MINOR    문구·오탈자·연락처                      → 버전만 증가
 *  ANNOTATION 마음의 편지                            → 이력 append */
const MATERIAL_KEY = [
  /수증자/,
  /상속인/,
  /beneficiar/i,
  /배분/,
  /allocation/i,
  /ratio/i,
  /기부처/,
  /기부액/,
  /donee/i,
  /donation/i,
  /recipient/i,
  /amount/i,
  /custodian/i,
  /asset/i,
];
const MINOR_KEY = [
  /문구/,
  /오탈자/,
  /연락처/,
  /주소/,
  /wording/i,
  /phrasing/i,
  /typo/i,
  /contact/i,
  /phone/i,
  /address/i,
];
const ANNOTATION_KEY = [/편지/, /메모/, /letter/i, /memo/i, /annotation/i];

function gradeOfKey(key: string): Materiality {
  if (MATERIAL_KEY.some((re) => re.test(key))) return "MATERIAL";
  if (MINOR_KEY.some((re) => re.test(key))) return "MINOR";
  if (ANNOTATION_KEY.some((re) => re.test(key))) return "ANNOTATION";
  // 모르는 변경은 올려 잡는다. 낮춰 잡으면 실질 변경이 재서명 없이 지나가고,
  // 그건 원장이 막으려던 바로 그 일이다 (서명 마찰보다 무효 논란이 비싸다).
  return "MATERIAL";
}

export function judgeMateriality(
  changeSummary: Record<string, unknown>,
): Materiality {
  const keys = Object.keys(changeSummary ?? {});
  if (keys.length === 0) return "ANNOTATION"; // 바뀐 항목이 없으면 메모성 기록
  let grade: Materiality = "ANNOTATION";
  for (const key of keys) {
    const k = gradeOfKey(key);
    if (k === "MATERIAL") return "MATERIAL"; // 가장 무거운 등급이 이긴다
    if (k === "MINOR") grade = "MINOR";
  }
  return grade;
}

/** FR-555 최신성 — 가장 큰 seq가 지금의 뜻이고 그 앞은 전부 지나간 뜻이다.
 *  저장된 status를 믿지 않고 **매번 유도한다**. 저장값을 믿으면 갱신이 하나라도
 *  누락된 순간 "유효 노드가 둘"이 되고, 그게 곧 소송거리다.
 *
 *  ⚠ 철회는 예외다. **마지막 노드가 REVOKED면 체인 전체가 닫힌다** —
 *  살아 있는 뜻이 하나도 없는 상태다.
 *
 *  왜 지난 노드를 고치지 않고 이렇게 하나: 원장은 append-only이고 트리거가
 *  UPDATE를 막는다 (NFR-704). 지난 노드의 status를 REVOKED로 바꾸려던 첫 설계는
 *  인메모리에서만 돌고 실 DB에서 터졌다 (2026-08-03, 공유 계약 스위트가 잡았다).
 *  철회는 **쌓는 행위**여야 하고, 그래야 "언제 왜 철회했는가"도 함께 남는다. */
export function withDerivedStatus(nodes: LedgerNode[]): LedgerNode[] {
  const ordered = [...nodes].sort((a, b) => a.seq - b.seq);
  const revoked = ordered.at(-1)?.status === "REVOKED";
  const activeSeq = revoked ? null : (ordered.at(-1)?.seq ?? null);
  return ordered.map((n) => {
    const status: LedgerNodeStatus = revoked
      ? "REVOKED"
      : n.seq === activeSeq
        ? "ACTIVE"
        : "SUPERSEDED";
    return { ...n, status };
  });
}
