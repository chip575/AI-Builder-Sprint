// M-LEDGER 순수 로직 (FR-552 · FR-553 수락 기준)
// 화면·라우트는 검사하지 않는다 — 원장이 증거가 되는 근거는 전부 이 세 함수에 있다.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { LedgerNode } from "@/lib/contracts";
import { buildNode, computeNodeHash, judgeMateriality, verifyChain } from "./chain";

const SUBJECT = "11111111-1111-4111-8111-111111111111";

/** 시각·id를 고정해 만든 3노드 체인 — 같은 입력이면 언제 돌려도 같은 해시가 나온다 */
function chainOf(count: number): LedgerNode[] {
  const nodes: LedgerNode[] = [];
  for (let i = 0; i < count; i += 1) {
    nodes.push(
      buildNode(
        nodes.at(-1),
        {
          subjectId: SUBJECT,
          materiality: "MINOR",
          changeSummary: { 문구: { before: `초안 ${i}`, after: `수정 ${i}` } },
          changeReason: `${i + 1}번째로 표현을 다듬었습니다`,
        },
        {
          id: randomUUID(),
          createdAt: new Date(Date.UTC(2026, 6, 1 + i)).toISOString(),
        },
      ),
    );
  }
  return nodes;
}

describe("해시 체인 (FR-553)", () => {
  it("노드 3개를 이어 붙인 체인은 검증을 통과한다", () => {
    const nodes = chainOf(3);
    expect(nodes.map((n) => n.seq)).toEqual([1, 2, 3]);
    expect(nodes[0]!.prevHash).toBeNull(); // 첫 노드는 앞이 없다
    expect(nodes[1]!.prevHash).toBe(nodes[0]!.nodeHash);
    expect(verifyChain(nodes)).toBe(true);
  });

  it("중간 노드를 1바이트 고치면 검증이 깨지고, 이후 노드도 함께 어긋난다", () => {
    const nodes = chainOf(3);
    const tampered = [...nodes];
    // 사유 끝의 마침표 하나 — 사람 눈에는 거의 보이지 않는 변조
    tampered[1] = { ...nodes[1]!, changeReason: `${nodes[1]!.changeReason}.` };

    expect(verifyChain(tampered)).toBe(false);
    // "이후 전부 불일치" — 3번 노드는 손대지 않았는데도 가리키던 앞이 사라진다
    const recomputed = computeNodeHash(tampered[1]!, tampered[0]!.nodeHash);
    expect(recomputed).not.toBe(nodes[1]!.nodeHash);
    expect(tampered[2]!.prevHash).not.toBe(recomputed);
    expect(verifyChain(nodes)).toBe(true); // 원본은 그대로 유효
  });
});

describe("실질성 등급 (FR-552)", () => {
  it("수증자 변경은 MATERIAL, 문구 수정은 MINOR", () => {
    expect(judgeMateriality({ 수증자: { before: "장남", after: "차녀" } })).toBe(
      "MATERIAL",
    );
    expect(judgeMateriality({ beneficiary: { before: "A", after: "B" } })).toBe(
      "MATERIAL",
    );
    expect(judgeMateriality({ 문구: { before: "드립니다", after: "남깁니다" } })).toBe(
      "MINOR",
    );
    // 편지 추가는 이력에 쌓기만 한다 — 재서명을 요구하면 편지를 안 쓰게 된다
    expect(judgeMateriality({ 마음의편지: "고맙다는 말을 덧붙였습니다" })).toBe(
      "ANNOTATION",
    );
    // 섞이면 무거운 쪽이 이긴다
    expect(judgeMateriality({ 문구: "다듬음", 기부처: "변경" })).toBe("MATERIAL");
  });
});
