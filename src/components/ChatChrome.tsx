import { hideCurrentWindow } from "../lib/tauriWindowApi";

export default function ChatChrome({
  onNewSession,
  newSessionDisabled,
}: {
  onNewSession?: () => void;
  newSessionDisabled?: boolean;
}) {
  return (
    <header className="chat-chrome" data-tauri-drag-region>
      <button
        type="button"
        className="chat-close-dot"
        aria-label="关闭"
        onClick={() => void hideCurrentWindow()}
      />
      <div className="chat-chrome-drag" data-tauri-drag-region />
      {onNewSession ? (
        <button
          type="button"
          className="chat-new-session"
          aria-label="新建会话"
          title="新建会话"
          disabled={newSessionDisabled}
          onClick={() => onNewSession()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 7v6M9 10h6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : (
        <span className="chat-chrome-spacer" />
      )}
    </header>
  );
}
