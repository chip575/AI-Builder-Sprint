import { describe, expect, it } from "vitest";
import { parseSseBuffer } from "./sse";

describe("SSE 파서", () => {
  it("완성된 블록만 잘라내고 나머지는 rest로 남긴다 (청크 경계 대응)", () => {
    const r = parseSseBuffer('event: token\ndata: "안녕"\n\nevent: token\ndata: "하');
    expect(r.events).toEqual([{ event: "token", data: '"안녕"' }]);
    expect(r.rest).toBe('event: token\ndata: "하');
  });

  it("이어붙인 다음 청크에서 나머지가 완성된다", () => {
    const first = parseSseBuffer('event: token\ndata: "하');
    expect(first.events).toHaveLength(0);
    const second = parseSseBuffer(first.rest + '세요"\n\n');
    expect(second.events).toEqual([{ event: "token", data: '"하세요"' }]);
    expect(second.rest).toBe("");
  });

  it("token 여러 개 + meta 1개 프로토콜을 순서대로 읽는다", () => {
    const raw =
      'event: token\ndata: "가"\n\n' +
      'event: token\ndata: "나"\n\n' +
      'event: meta\ndata: {"sessionId":"s1"}\n\n';
    const { events, rest } = parseSseBuffer(raw);
    expect(events.map((e) => e.event)).toEqual(["token", "token", "meta"]);
    expect(JSON.parse(events[2]!.data)).toEqual({ sessionId: "s1" });
    expect(rest).toBe("");
  });

  it("data 여러 줄은 개행으로 이어 붙인다 (SSE 규격)", () => {
    const { events } = parseSseBuffer("event: x\ndata: 1\ndata: 2\n\n");
    expect(events[0]!.data).toBe("1\n2");
  });

  it("data 없는 블록은 무시한다 (주석·핑)", () => {
    const { events } = parseSseBuffer(": keep-alive\n\nevent: token\ndata: \"값\"\n\n");
    expect(events).toHaveLength(1);
  });
});
