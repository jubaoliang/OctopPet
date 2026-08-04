import { useState } from "react";

interface ComposerProps {
  disabled?: boolean;
  streaming?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export default function Composer({
  disabled = false,
  streaming = false,
  onSend,
  onStop,
}: ComposerProps) {
  const [text, setText] = useState("");
  const canSend = !disabled && !streaming && text.trim().length > 0;

  function submit() {
    const value = text.trim();
    if (!canSend || !value) return;
    onSend(value);
    setText("");
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        aria-label="消息"
        rows={2}
        value={text}
        disabled={disabled}
        placeholder={disabled ? "连接后即可发送" : "输入消息…"}
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="composer-actions">
        <button type="submit" disabled={!canSend}>
          发送
        </button>
        <button
          className="button-secondary"
          type="button"
          disabled={!streaming}
          onClick={onStop}
        >
          停止
        </button>
      </div>
    </form>
  );
}
