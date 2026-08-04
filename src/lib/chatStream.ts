import { normalizeBaseUrl } from "./configLogic";

export function buildChatWsUrl(
  baseUrl: string,
  agentId: string,
  token: string,
): string {
  const root = normalizeBaseUrl(baseUrl);
  const u = new URL(root);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  const prefix = u.pathname.replace(/\/+$/, "");
  u.pathname = `${prefix}/api/agents/${encodeURIComponent(agentId)}/chat/ws`;
  u.search = "";
  u.hash = "";
  u.searchParams.set("token", token);
  return u.toString();
}

export function buildUserTurnPayload(args: {
  text: string;
  threadId: string;
  sessionKey?: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type: "user_turn",
    text: args.text,
    thread_id: args.threadId,
    messages: [{ role: "user", content: args.text }],
  };
  if (args.sessionKey) payload.session_key = args.sessionKey;
  return payload;
}

export function buildCancelPayload(threadId: string): Record<string, unknown> {
  return { type: "cancel", thread_id: threadId };
}

export function applyStreamChunk(
  prevAssistantText: string,
  chunk: unknown,
): { text: string; done: boolean; error?: string } {
  if (!chunk || typeof chunk !== "object") {
    return { text: prevAssistantText, done: false };
  }
  const c = chunk as { type?: string; content?: string; message?: string };
  if (c.type === "token" && typeof c.content === "string") {
    return { text: prevAssistantText + c.content, done: false };
  }
  if (c.type === "done") return { text: prevAssistantText, done: true };
  if (c.type === "error") {
    return {
      text: prevAssistantText,
      done: true,
      error: c.message || "流式错误",
    };
  }
  return { text: prevAssistantText, done: false };
}
