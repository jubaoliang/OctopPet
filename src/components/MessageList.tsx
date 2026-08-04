import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

import type { ChatMessage } from "../lib/types";

export default function MessageList({
  messages,
  loading = false,
}: {
  messages: ChatMessage[];
  loading?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages]);

  return (
    <section className="message-list" aria-label="聊天消息" aria-live="polite">
      {loading ? (
        <p className="chat-empty">正在加载对话…</p>
      ) : messages.length === 0 ? (
        <p className="chat-empty">开始和代理聊聊吧</p>
      ) : (
        messages.map((message) => (
          <article
            key={message.id}
            className={`message message-${message.role}${message.pending ? " message-pending" : ""}`}
          >
            {message.role === "assistant" ? (
              <ReactMarkdown>{message.content || "…"}</ReactMarkdown>
            ) : (
              <p>{message.content}</p>
            )}
            {message.error ? (
              <small className="message-error">{message.error}</small>
            ) : null}
          </article>
        ))
      )}
      <div ref={endRef} />
    </section>
  );
}
