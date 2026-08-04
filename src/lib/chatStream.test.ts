import { describe, expect, it } from "vitest";
import {
  buildChatWsUrl,
  buildUserTurnPayload,
  applyStreamChunk,
  buildCancelPayload,
} from "./chatStream";

describe("chatStream", () => {
  it("builds ws url with token", () => {
    expect(buildChatWsUrl("https://h.example", "a1", "tok")).toBe(
      "wss://h.example/api/agents/a1/chat/ws?token=tok",
    );
    expect(buildChatWsUrl("http://localhost:8787", "a1", "tok")).toBe(
      "ws://localhost:8787/api/agents/a1/chat/ws?token=tok",
    );
    expect(buildChatWsUrl("https://h.example/octop", "a/1", "t ok")).toBe(
      "wss://h.example/octop/api/agents/a%2F1/chat/ws?token=t+ok",
    );
  });

  it("builds user_turn payload", () => {
    expect(buildUserTurnPayload({ text: "hi", threadId: "t1" })).toEqual({
      type: "user_turn",
      text: "hi",
      thread_id: "t1",
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("accumulates tokens and finishes on done/error", () => {
    let t = "";
    let r = applyStreamChunk(t, { type: "token", content: "Hel" });
    expect(r).toEqual({ text: "Hel", done: false });
    r = applyStreamChunk(r.text, { type: "token", content: "lo" });
    expect(r).toEqual({ text: "Hello", done: false });
    r = applyStreamChunk(r.text, { type: "done" });
    expect(r.done).toBe(true);
    r = applyStreamChunk("", { type: "error", message: "boom" });
    expect(r).toEqual({ text: "", done: true, error: "boom" });
  });

  it("builds cancel payload", () => {
    expect(buildCancelPayload("t1")).toEqual({ type: "cancel", thread_id: "t1" });
  });
});
