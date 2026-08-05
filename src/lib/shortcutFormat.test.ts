import { describe, expect, it } from "vitest";

import {
  formatShortcutDisplay,
  keyboardEventToShortcut,
} from "./shortcutFormat";

function keyEvent(init: KeyboardEventInit & { key: string }): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, ...init });
}

describe("keyboardEventToShortcut", () => {
  it("maps modifier + letter to Tauri shortcut format", () => {
    expect(
      keyboardEventToShortcut(
        keyEvent({
          key: "o",
          code: "KeyO",
          metaKey: true,
          shiftKey: true,
        }),
      ),
    ).toBe("CmdOrCtrl+Shift+O");
  });

  it("maps ctrl + alt + space on Windows-style input", () => {
    expect(
      keyboardEventToShortcut(
        keyEvent({
          key: " ",
          code: "Space",
          ctrlKey: true,
          altKey: true,
        }),
      ),
    ).toBe("CmdOrCtrl+Alt+Space");
  });

  it("ignores modifier-only presses", () => {
    expect(
      keyboardEventToShortcut(
        keyEvent({
          key: "Shift",
          code: "ShiftLeft",
          shiftKey: true,
        }),
      ),
    ).toBeNull();
  });

  it("requires at least one modifier", () => {
    expect(
      keyboardEventToShortcut(
        keyEvent({
          key: "o",
          code: "KeyO",
        }),
      ),
    ).toBeNull();
  });
});

describe("formatShortcutDisplay", () => {
  it("renders mac symbols", () => {
    expect(formatShortcutDisplay("CmdOrCtrl+Shift+O", "MacIntel")).toBe("⌘⇧O");
  });

  it("renders Windows labels", () => {
    expect(formatShortcutDisplay("CmdOrCtrl+Shift+O", "Win32")).toBe(
      "Ctrl+Shift+O",
    );
  });

  it("shows placeholder for empty shortcut", () => {
    expect(formatShortcutDisplay("  ", "MacIntel")).toBe("未设置");
  });
});
