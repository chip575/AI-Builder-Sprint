// SSE 파서 — `POST /api/session/message`의 스트림을 읽는다.
//
// ⚠ EventSource를 쓰지 않는다. EventSource는 **GET 전용**인데 우리 세션 라우트는
//    POST SSE다. fetch + ReadableStream 리더로 직접 파싱해야 한다.
//    (`event: token` 여러 개 → `event: meta` 1개로 끝나는 프로토콜)

export interface SseEvent {
  event: string;
  data: string;
}

/**
 * 버퍼에서 완성된 이벤트 블록만 잘라낸다. 남은 조각은 rest로 돌려주고
 * 다음 청크와 이어 붙인다 — 청크 경계가 이벤트 중간을 자를 수 있기 때문.
 */
export function parseSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  let rest = buffer;

  for (;;) {
    const idx = rest.indexOf("\n\n");
    if (idx < 0) break;
    const block = rest.slice(0, idx);
    rest = rest.slice(idx + 2);

    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length > 0) events.push({ event, data: dataLines.join("\n") });
  }
  return { events, rest };
}

export interface SseHandlers {
  /** 본문 조각 — 도착하는 대로 화면에 이어 붙인다 */
  onToken?: (text: string) => void;
  /**
   * 대화 중 감지된 가지 제안 (FR-115A). 서버는 응답 뒤·meta 앞에 이걸 보낸다.
   *
   * ⚠ 핸들러가 없으면 이벤트가 **조용히 버려진다.** 실제로 그래서 첫 발화가 아닌
   *   "서류를 줬으면 좋겠는데요" 같은 말에 화면이 아무 반응을 하지 않았다 —
   *   서버는 제안을 만들어 보냈는데 클라이언트가 읽지 않았다 (2026-08-01).
   */
  onProposal?: (proposal: unknown) => void;
  /** 스트림의 마지막 이벤트. 라우팅 판단은 여기서만 한다 */
  onMeta?: (meta: unknown) => void;
}

/** POST로 SSE를 열고 끝까지 읽는다. SSE가 아니면(에러 envelope 등) 그 JSON을 던진다. */
export async function postSse(
  url: string,
  body: unknown,
  handlers: SseHandlers = {},
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get("Content-Type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    // 서버가 envelope로 거부한 경우 — nextAction을 그대로 화면에 쓸 수 있게 던진다
    const payload = await res.json().catch(() => null);
    throw Object.assign(new Error("SSE 아님"), { payload });
  }
  if (!res.body) throw new Error("응답 본문이 없습니다");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseBuffer(buffer);
    buffer = rest;
    for (const e of events) {
      if (e.event === "token") handlers.onToken?.(JSON.parse(e.data));
      else if (e.event === "proposal") handlers.onProposal?.(JSON.parse(e.data));
      else if (e.event === "meta") handlers.onMeta?.(JSON.parse(e.data));
    }
  }
}
