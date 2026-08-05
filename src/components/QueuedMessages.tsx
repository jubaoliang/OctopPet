import { X } from "lucide-react";

import { queuedPreview, type QueuedChatItem } from "../lib/messageQueue";

export default function QueuedMessages({
  items,
  onRemove,
}: {
  items: QueuedChatItem[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="chat-queue" aria-label="排队中的消息">
      {items.map((item, index) => (
        <div key={item.id} className="chat-queue-item">
          <span className="chat-queue-index">{index + 1}</span>
          <span className="chat-queue-text">{queuedPreview(item)}</span>
          <button
            type="button"
            className="chat-queue-remove"
            aria-label={`移除排队消息 ${index + 1}`}
            onClick={() => onRemove(item.id)}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
