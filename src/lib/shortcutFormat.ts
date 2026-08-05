const MODIFIER_ONLY_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "OS"]);

const SPECIAL_KEY_MAP: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

function normalizeShortcutKey(event: KeyboardEvent): string | null {
  const { key, code } = event;

  if (MODIFIER_ONLY_KEYS.has(key)) {
    return null;
  }

  const mapped = SPECIAL_KEY_MAP[key];
  if (mapped) {
    return mapped;
  }

  if (/^F\d{1,2}$/i.test(key)) {
    return key.toUpperCase();
  }

  if (key.length === 1 && /[a-zA-Z0-9]/.test(key)) {
    return key.toUpperCase();
  }

  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3);
  }

  if (code.startsWith("Digit") && code.length === 6) {
    return code.slice(5);
  }

  return null;
}

export function keyboardEventToShortcut(event: KeyboardEvent): string | null {
  const normalizedKey = normalizeShortcutKey(event);
  if (!normalizedKey) {
    return null;
  }

  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) {
    parts.push("CmdOrCtrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }

  if (parts.length === 0) {
    return null;
  }

  parts.push(normalizedKey);
  return parts.join("+");
}

function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function formatShortcutDisplay(
  shortcut: string,
  platform = navigator.platform,
): string {
  const trimmed = shortcut.trim();
  if (!trimmed) {
    return "未设置";
  }

  const mac = isMacPlatform(platform);
  const tokens = trimmed.split("+").map((part) => part.trim());
  const keyToken = tokens[tokens.length - 1] ?? "";
  const modifierTokens = tokens.slice(0, -1);

  const modifierLabels = modifierTokens.map((token) => {
    switch (token) {
      case "CmdOrCtrl":
      case "CommandOrControl":
        return mac ? "⌘" : "Ctrl";
      case "Control":
        return mac ? "⌃" : "Ctrl";
      case "Alt":
        return mac ? "⌥" : "Alt";
      case "Shift":
        return mac ? "⇧" : "Shift";
      default:
        return token;
    }
  });

  const keyLabel =
    keyToken === "Space"
      ? mac
        ? "Space"
        : "Space"
      : keyToken.length === 1
        ? keyToken.toUpperCase()
        : keyToken;

  return [...modifierLabels, keyLabel].join(mac ? "" : "+");
}
