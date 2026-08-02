// 어댑터 선택 (ADR-4) — MODUSIGN_MODE=mock이면 키 없이 전 흐름이 돈다 (NFR-707)
// realSigner(ModusignSigner)는 구현돼 있다 — 2026-08-02 실서명 왕복 1건 성공.
// 키가 없으면 조용히 mock으로 폴백하지 않고 호출 시점에 명시적으로 실패한다
// (보안 7조: 조용히 넘기지 않는다). "실 서명이 됐다"는 착각을 만들지 않기 위해서다.
import { MockSigner } from "./mock/mock-signer";
import { ModusignSigner } from "./real/modusign";
import type { SignerPort } from "./port";

/** 02.4 §5 — mock 모드는 요청 후 3초 뒤 자동 완료 */
const MOCK_AUTO_COMPLETE_MS = 3_000;

const mode = process.env.MODUSIGN_MODE ?? "mock";

/** MODUSIGN_TEMPLATE_<DocType> → 템플릿 ID. 미등록 키는 호출 시점에 알려주며 실패한다 */
function templateIdsFromEnv(): Record<string, string | undefined> {
  const ids: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("MODUSIGN_TEMPLATE_") && v) {
      ids[k.slice("MODUSIGN_TEMPLATE_".length)] = v;
    }
  }
  return ids;
}

function realSigner(): SignerPort {
  const apiKey = process.env.MODUSIGN_API_KEY;
  if (!apiKey) {
    // 키 없이 real을 켜면 조용히 mock으로 떨어지지 않고 명시적으로 실패한다 (보안 7조)
    const fail = () =>
      Promise.reject(new Error("MODUSIGN_MODE=real인데 MODUSIGN_API_KEY가 없습니다."));
    return {
      requestWithTemplate: fail,
      createEmbeddedDraft: fail,
      getDocument: fail,
      listDocuments: fail,
      resendNotification: fail,
      cancel: fail,
    };
  }
  return new ModusignSigner({ apiKey, templateIds: templateIdsFromEnv() });
}

// globalThis 캐싱 — 번들 청크 분리로 인스턴스가 갈라지는 것 방지 (영속화 시 제거)
const g = globalThis as unknown as { __namgidaMockSigner?: MockSigner };

/** 프로세스 전역 단일 인스턴스 — 라우트 간 상태 공유 */
export const signer: SignerPort =
  mode === "real"
    ? realSigner()
    : (g.__namgidaMockSigner ??= new MockSigner(MOCK_AUTO_COMPLETE_MS));

/** webhook-sim 등 mock 전용 기능 접근자 — real 모드면 null */
export const mockSigner: MockSigner | null =
  signer instanceof MockSigner ? signer : null;
