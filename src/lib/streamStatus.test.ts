import { describe, expect, it } from "vitest";
import {
  applyStreamStatusEvent,
  beginStreamStatus,
  formatStreamStatusLabel,
  idleStreamStatus,
} from "./streamStatus";

describe("streamStatus", () => {
  it("starts as generating with elapsed label before first token", () => {
    const started = beginStreamStatus(1_000);
    expect(formatStreamStatusLabel(started, 1_000)).toBe("生成中 · 0s");
    expect(formatStreamStatusLabel(started, 3_500)).toBe("生成中 · 2s");
  });

  it("keeps generating after tokens without elapsed timer", () => {
    let state = beginStreamStatus(1_000);
    state = applyStreamStatusEvent(state, { type: "token", content: "hi" });
    expect(formatStreamStatusLabel(state, 4_000)).toBe("生成中");
  });

  it("switches to tool label on tool_call_chunk and back after tool_result", () => {
    let state = beginStreamStatus(1_000);
    state = applyStreamStatusEvent(state, {
      type: "tool_call_chunk",
      name: "web_search",
    });
    expect(formatStreamStatusLabel(state, 2_000)).toBe("正在调用：web_search");

    state = applyStreamStatusEvent(state, { type: "tool_result" });
    // Still awaiting first token → keep elapsed timer.
    expect(formatStreamStatusLabel(state, 3_000)).toBe("生成中 · 2s");
  });

  it("returns null when idle or stream ends", () => {
    expect(formatStreamStatusLabel(idleStreamStatus(), 1_000)).toBeNull();
    let state = beginStreamStatus(1_000);
    state = applyStreamStatusEvent(state, { type: "done" });
    expect(formatStreamStatusLabel(state, 2_000)).toBeNull();
  });
});
