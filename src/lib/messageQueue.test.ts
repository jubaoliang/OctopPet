import { describe, expect, it } from "vitest";
import {
  CHAT_QUEUE_MAX_ITEMS,
  enqueueChatItem,
  removeChatItem,
  shiftChatItem,
  type QueuedChatItem,
} from "./messageQueue";

function item(id: string, text: string): QueuedChatItem {
  return {
    id,
    text,
    attachments: [],
    model: null,
    mcpServers: [],
    createdAt: 1,
  };
}

describe("messageQueue", () => {
  it("enqueues fifo items until max", () => {
    let queue: QueuedChatItem[] = [];
    const first = enqueueChatItem(queue, item("1", "a"));
    expect(first.ok).toBe(true);
    queue = first.queue;

    for (let i = 2; i <= CHAT_QUEUE_MAX_ITEMS; i += 1) {
      const result = enqueueChatItem(queue, item(String(i), `t${i}`));
      expect(result.ok).toBe(true);
      queue = result.queue;
    }

    const full = enqueueChatItem(queue, item("overflow", "x"));
    expect(full.ok).toBe(false);
    expect(full.queue).toHaveLength(CHAT_QUEUE_MAX_ITEMS);
  });

  it("removes and shifts from the head", () => {
    let queue = [item("1", "a"), item("2", "b"), item("3", "c")];
    queue = removeChatItem(queue, "2");
    expect(queue.map((entry) => entry.id)).toEqual(["1", "3"]);

    const shifted = shiftChatItem(queue);
    expect(shifted.item?.id).toBe("1");
    expect(shifted.queue.map((entry) => entry.id)).toEqual(["3"]);
  });
});
