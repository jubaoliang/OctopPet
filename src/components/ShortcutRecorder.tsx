import { useEffect, useRef, useState } from "react";

import {
  formatShortcutDisplay,
  keyboardEventToShortcut,
} from "../lib/shortcutFormat";

type ShortcutRecorderProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export default function ShortcutRecorder({
  id,
  value,
  onChange,
  disabled = false,
}: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!recording) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRecording(false);
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        onChange("");
        setRecording(false);
        return;
      }

      const shortcut = keyboardEventToShortcut(event);
      if (shortcut) {
        onChange(shortcut);
        setRecording(false);
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onChange, recording]);

  function startRecording() {
    if (disabled) {
      return;
    }
    setRecording(true);
    requestAnimationFrame(() => buttonRef.current?.focus());
  }

  const label = recording
    ? "按下快捷键…"
    : value.trim()
      ? formatShortcutDisplay(value)
      : "点击录制";

  return (
    <button
      ref={buttonRef}
      id={id}
      type="button"
      className={`shortcut-recorder${recording ? " is-recording" : ""}`}
      aria-label={recording ? "正在录制快捷键" : "录制快捷键"}
      aria-pressed={recording}
      disabled={disabled}
      onClick={startRecording}
      onBlur={() => setRecording(false)}
    >
      {label}
    </button>
  );
}
