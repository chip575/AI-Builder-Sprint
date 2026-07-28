// 어댑터 선택 (ADR-4) — MODUSIGN_MODE=mock이면 키 없이 전 흐름이 돈다 (NFR-707)
// realSigner는 M-SIGN에서 구현된다. 그 전까지 real 모드는 명시적으로 실패한다 —
// 조용히 mock으로 폴백하면 "실 서명이 됐다"는 착각을 만든다 (보안 7조: 조용히 넘기지 않는다).
import { MockSigner } from "./mock/mock-signer";
import type { SignerPort } from "./port";

/** 02.4 §5 — mock 모드는 요청 후 3초 뒤 자동 완료 */
const MOCK_AUTO_COMPLETE_MS = 3_000;

const mode = process.env.MODUSIGN_MODE ?? "mock";

function unimplementedReal(): SignerPort {
  const fail = () =>
    Promise.reject(
      new Error("MODUSIGN_MODE=real은 아직 구현 전입니다 (M-SIGN). mock으로 전환하세요."),
    );
  return {
    requestWithTemplate: fail,
    createEmbeddedDraft: fail,
    getDocument: fail,
    listDocuments: fail,
    resendNotification: fail,
    cancel: fail,
  };
}

/** 프로세스 전역 단일 인스턴스 — 라우트 간 상태 공유 (Next dev의 모듈 캐시 기준) */
export const signer: SignerPort =
  mode === "real" ? unimplementedReal() : new MockSigner(MOCK_AUTO_COMPLETE_MS);

/** webhook-sim 등 mock 전용 기능 접근자 — real 모드면 null */
export const mockSigner: MockSigner | null =
  signer instanceof MockSigner ? signer : null;
