// M-SIGN-LIFECYCLE — 미서명 리마인드의 임계·문구·발송 이력 (FR-507)
// route.ts에 두지 않는다: Next 라우트 모듈은 HTTP 메서드 외 export를 허용하지 않아
// 테스트가 임계값과 문구를 직접 검사할 수 없다. 임계와 문구는 계약이 아니라 코드의 몫이다 (P3).
import { store } from "../store";

/** 리마인드 임계 — 서명 요청 후 이만큼 지나야 보낼 수 있다.
 *  계약(RemindReq/RemindRes)에도 프롬프트에도 싣지 않는다 (P3). 바꾸려면 여기만 고친다.
 *  ⚠ 기준점은 **서명 요청 시각**이지 직전 리마인드 시각이 아니다 — 발송 간 재무장은
 *    하지 않는다. 정책을 바꾸려면 사람이 결정한다 (FR-113 독촉 금지와 맞닿아 있다). */
export const REMIND_AFTER_MS = 48 * 60 * 60 * 1000;

/** audit_logs.action — 발송 이력의 정본이 남는 자리 */
export const REMIND_AUDIT_ACTION = "sign.remind";

// 발송 이력의 정본은 audit_logs다. 다만 StorePort에는 감사 로그를 되읽는 연산이 없고
// store 확장은 이번 작업의 금지 항목이라, remindCount는 프로세스 안 사본으로 센다.
// 인스턴스가 갈리면 이 수는 뒤로 갈 수 있다 — 다만 임계 판정은 이 수에 기대지 않고
// 요청 시각만 보므로 **발송 제어는 영향받지 않는다**(적게 세일 뿐 더 보내지지 않는다).
// StorePort에 countAudits(action, subject)가 생기면 이 사본은 지운다.
const g = globalThis as unknown as { __namgidaRemindCounts?: Map<string, number> };
const counts = (g.__namgidaRemindCounts ??= new Map<string, number>());

export function remindCount(draftId: string): number {
  return counts.get(draftId) ?? 0;
}

/** 발송 후 이력을 남기고 누적 횟수를 돌려준다.
 *  ⚠ 감사 기록 실패가 본 흐름을 막지 않는다 (StorePort 규칙) — 이미 나간 알림을
 *    응답 실패로 되돌릴 수는 없다. 수신자는 **인원수만** 남긴다 (보안 1조). */
export async function recordRemind(
  draftId: string,
  sentAt: string,
  recipients: number,
): Promise<number> {
  const next = remindCount(draftId) + 1;
  counts.set(draftId, next);
  await store
    .recordAudit(REMIND_AUDIT_ACTION, draftId, { sentAt, recipients, seq: next })
    .catch(() => {});
  return next;
}

/** 다시 보낼 수 있는 시각 — 서명 요청 시각 + 임계.
 *  요청 시각을 읽지 못하면(외부 응답에 없음) 초안 생성 시각으로 물러선다. */
export function remindAvailableAt(startedAt: string | null | undefined, fallback: string): Date {
  const base = Date.parse(startedAt ?? "");
  const at = Number.isNaN(base) ? Date.parse(fallback) : base;
  return new Date(at + REMIND_AFTER_MS);
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // 문구는 한국 시간으로 읽힌다
const DAY_MS = 24 * 60 * 60 * 1000;

function kst(d: Date) {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  return {
    day: Math.floor(k.getTime() / DAY_MS),
    hour: k.getUTCHours(),
    month: k.getUTCMonth() + 1,
    date: k.getUTCDate(),
  };
}

function partOfDay(hour: number): string {
  if (hour < 6) return "새벽";
  if (hour < 12) return "오전";
  if (hour < 18) return "오후";
  return "저녁";
}

/** "내일 오후 이후에" — 분 단위 카운트다운을 보여주지 않는다.
 *  남은 시간을 초 단위로 세는 화면은 그 자체가 재촉이다 (NFR-708). */
export function whenAgain(availableAt: Date, now: Date): string {
  const a = kst(availableAt);
  const n = kst(now);
  const diff = a.day - n.day;
  const when =
    diff <= 0 ? "오늘" : diff === 1 ? "내일" : diff === 2 ? "모레" : `${a.month}월 ${a.date}일`;
  return `${when} ${partOfDay(a.hour)} 이후에`;
}

/** 임계 이전 응답 문구 — 실패가 아니라 "아직 때가 아니다"로 돌려보낸다 (NFR-705).
 *  재촉·긴급성 어휘를 쓰지 않는다 (NFR-708). 기다리는 쪽을 조급하게 만들지 않는 것이 목적이다. */
export function tooEarlyCopy(availableAt: Date, now: Date) {
  return {
    message: "상대가 문서를 살펴보고 있을 시간이에요.",
    nextAction: `${whenAgain(availableAt, now)} 다시 보내실 수 있어요.`,
  };
}
