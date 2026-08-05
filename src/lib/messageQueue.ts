import type { ChatAttachment } from "./octopHttp";

export const CHAT_QUEUE_MAX_ITEMS = 5;

export type QueuedChatItem = {
  id: string;
  text: string;
  attachments: ChatAttachment[];
  model: string | null;
  mcpServers: string[];
  createdAt: number;
};

export function enqueueChatItem(
  queue: QueuedChatItem[],
  item: QueuedChatItem,
): { ok: boolean; queue: QueuedChatItem[] } {
  if (queue.length >= CHAT_QUEUE_MAX_ITEMS) {
    return { ok: false, queue };
  }
  return { ok: true, queue: [...queue, item] };
}

export function removeChatItem(
  queue: QueuedChatItem[],
  id: string,
): QueuedChatItem[] {
  return queue.filter((item) => item.id !== id);
}

export function shiftChatItem(queue: QueuedChatItem[]): {
  item: QueuedChatItem | undefined;
  queue: QueuedChatItem[];
} {
  if (queue.length === 0) return { item: undefined, queue };
  const [item, ...rest] = queue;
  return { item, queue: rest };
}

export function queuedPreview(item: QueuedChatItem): string {
  const text = item.text.trim();
  if (text) return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  if (item.attachments.length) {
    return `[附件] ${item.attachments.map((a) => a.filename).join(", ")}`;
  }
  return "(空消息)";
}
