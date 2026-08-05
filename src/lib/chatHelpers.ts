import { OctopHttpError, extractTextContent } from "./octopHttp";
import type { ChatMessage } from "./types";

export const CHAT_WIDTH = 400;
export const CHAT_EXPANDED_HEIGHT = 560;
export const CHAT_COMPACT_MIN_HEIGHT = 120;
export const CHAT_MIN_WIDTH = 320;
export const CHAT_MIN_HEIGHT = 200;

let nextMessageId = 0;

export function nextChatMessageId(prefix: string): string {
  nextMessageId += 1;
  return `${prefix}-${nextMessageId}`;
}

export function historyMessages(
  rows: Array<{ role: string; content: unknown }>,
): ChatMessage[] {
  return rows.flatMap((row) => {
    if (
      row.role !== "user" &&
      row.role !== "assistant" &&
      row.role !== "system"
    ) {
      return [];
    }
    const content = extractTextContent(row.content);
    if (!content) return [];
    return [{ id: nextChatMessageId("history"), role: row.role, content }];
  });
}

export function chatErrorText(error: unknown): string {
  if (error instanceof OctopHttpError) {
    if (error.status === 401) return "登录已失效，请重新设置账号";
    return `服务请求失败（${error.status}）`;
  }
  return error instanceof Error ? error.message : "连接服务失败";
}
