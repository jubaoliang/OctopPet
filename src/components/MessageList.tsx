import { useEffect, useRef, useState } from "react";

import type { ChatMessage } from "../lib/types";
import AssistantMarkdown from "./AssistantMarkdown";
import GeneratingIndicator from "./GeneratingIndicator";

async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="9"
        y="9"
        width="13"
        height="13"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconRetry() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 3v5h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSpeak() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M11 5 6 9H2v6h4l5 4V5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MessageActions({
  messageId,
  text,
  disabled,
  speaking,
  onRetry,
  onSpeak,
}: {
  messageId: string;
  text: string;
  disabled?: boolean;
  speaking?: boolean;
  onRetry: (messageId: string) => void;
  onSpeak: (messageId: string, text: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="message-actions">
      <button
        type="button"
        className={`message-action${copied ? " is-active" : ""}`}
        aria-label="复制"
        title="复制"
        disabled={!text || disabled}
        onClick={() => {
          void copyText(text).then((ok) => {
            if (!ok) return;
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        <IconCopy />
      </button>
      <button
        type="button"
        className="message-action"
        aria-label="重试"
        title="重新生成"
        disabled={disabled || !text}
        onClick={() => onRetry(messageId)}
      >
        <IconRetry />
      </button>
      <button
        type="button"
        className={`message-action${speaking ? " is-active" : ""}`}
        aria-label="语音"
        title={speaking ? "停止朗读" : "朗读"}
        disabled={!text || disabled}
        onClick={() => onSpeak(messageId, text)}
      >
        <IconSpeak />
      </button>
    </div>
  );
}

export default function MessageList({
  messages,
  loading = false,
  actionsDisabled = false,
  speakingId = null,
  statusLabel = null,
  onRetry,
  onSpeak,
}: {
  messages: ChatMessage[];
  loading?: boolean;
  actionsDisabled?: boolean;
  speakingId?: string | null;
  statusLabel?: string | null;
  onRetry?: (messageId: string) => void;
  onSpeak?: (messageId: string, text: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, statusLabel]);

  if (!loading && messages.length === 0 && !statusLabel) {
    return null;
  }

  return (
    <section className="message-list" aria-label="聊天消息" aria-live="polite">
      {loading ? (
        <p className="chat-empty">正在加载对话…</p>
      ) : (
        messages.map((message) => {
          const showActions =
            message.role === "assistant" &&
            !message.pending &&
            Boolean(message.content) &&
            onRetry &&
            onSpeak;

          // Pending empty bubble is redundant with GeneratingIndicator.
          if (
            message.role === "assistant" &&
            message.pending &&
            !message.content
          ) {
            return null;
          }

          return (
            <article
              key={message.id}
              className={`message message-${message.role}${message.pending ? " message-pending" : ""}`}
            >
              {message.role === "assistant" ? (
                <AssistantMarkdown
                  content={message.content}
                  streaming={Boolean(message.pending)}
                />
              ) : (
                <p>{message.content}</p>
              )}
              {message.error ? (
                <small className="message-error">{message.error}</small>
              ) : null}
              {showActions ? (
                <MessageActions
                  messageId={message.id}
                  text={message.content}
                  disabled={actionsDisabled}
                  speaking={speakingId === message.id}
                  onRetry={onRetry}
                  onSpeak={onSpeak}
                />
              ) : null}
            </article>
          );
        })
      )}
      {statusLabel ? <GeneratingIndicator label={statusLabel} /> : null}
      <div ref={endRef} />
    </section>
  );
}
