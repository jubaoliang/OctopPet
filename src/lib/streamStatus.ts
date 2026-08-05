export type StreamStatusPhase = "idle" | "generating" | "tool";

export type StreamStatusState = {
  phase: StreamStatusPhase;
  toolName?: string;
  startedAt: number | null;
  hasAssistantText: boolean;
};

export function idleStreamStatus(): StreamStatusState {
  return {
    phase: "idle",
    startedAt: null,
    hasAssistantText: false,
  };
}

export function beginStreamStatus(now = Date.now()): StreamStatusState {
  return {
    phase: "generating",
    startedAt: now,
    hasAssistantText: false,
  };
}

function toolNameFromChunk(chunk: Record<string, unknown>): string {
  const name = chunk.name ?? chunk.tool_name ?? chunk.toolName;
  if (typeof name === "string" && name.trim()) return name.trim();
  return "工具";
}

export function applyStreamStatusEvent(
  state: StreamStatusState,
  chunk: unknown,
): StreamStatusState {
  if (!chunk || typeof chunk !== "object") return state;
  const c = chunk as Record<string, unknown>;
  switch (c.type) {
    case "token":
      return {
        ...state,
        phase: state.phase === "idle" ? "generating" : "generating",
        toolName: undefined,
        hasAssistantText:
          state.hasAssistantText ||
          (typeof c.content === "string" && c.content.length > 0),
      };
    case "tool_call_chunk":
      return {
        ...state,
        phase: "tool",
        toolName: toolNameFromChunk(c),
      };
    case "tool_result":
      if (state.phase === "idle") return state;
      return {
        ...state,
        phase: "generating",
        toolName: undefined,
      };
    case "done":
    case "error":
      return idleStreamStatus();
    default:
      return state;
  }
}

export function formatStreamStatusLabel(
  state: StreamStatusState,
  now = Date.now(),
): string | null {
  if (state.phase === "idle") return null;
  if (state.phase === "tool") {
    return `正在调用：${state.toolName || "工具"}`;
  }
  if (!state.hasAssistantText && state.startedAt != null) {
    const seconds = Math.max(0, Math.floor((now - state.startedAt) / 1000));
    return `生成中 · ${seconds}s`;
  }
  return "生成中";
}
