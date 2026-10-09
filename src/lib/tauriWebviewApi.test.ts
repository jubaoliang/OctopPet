import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { availableMonitors, cursorPosition } from "@tauri-apps/api/window";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  availableMonitors: vi.fn(),
  cursorPosition: vi.fn(),
  LogicalPosition: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
  LogicalSize: class {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
  PhysicalPosition: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
}));

import {
  clearPetWebviewChrome,
  getPetPointerState,
  petSupportsManualMotion,
  petUsesManualDrag,
  setPetWebviewPosition,
} from "./tauriWebviewApi";

describe("petUsesManualDrag", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is true on Windows user agents", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
    });
    expect(petUsesManualDrag()).toBe(true);
  });

  it("is false on macOS user agents", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    });
    expect(petUsesManualDrag()).toBe(false);
    expect(petSupportsManualMotion()).toBe(true);
  });
});

describe("clearPetWebviewChrome", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not rewrite HWND chrome from the webview on Windows", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
    });
    const win = {
      setShadow: vi.fn().mockResolvedValue(undefined),
      setBackgroundColor: vi.fn().mockResolvedValue(undefined),
    };

    await clearPetWebviewChrome(win as never);

    expect(win.setShadow).not.toHaveBeenCalled();
    expect(win.setBackgroundColor).not.toHaveBeenCalled();
  });

  it("clears window background on macOS", async () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    });
    const win = {
      setShadow: vi.fn().mockResolvedValue(undefined),
      setBackgroundColor: vi.fn().mockResolvedValue(undefined),
    };

    await clearPetWebviewChrome(win as never);

    expect(win.setBackgroundColor).toHaveBeenCalledWith([0, 0, 0, 0]);
    expect(win.setShadow).toHaveBeenCalledWith(false);
  });
});

describe("pet physical positioning", () => {
  it("matches the physical Retina cursor against physical monitor bounds", async () => {
    vi.mocked(getCurrentWebviewWindow).mockReturnValue({
      scaleFactor: async () => 2,
    } as never);
    vi.mocked(cursorPosition).mockResolvedValue({ x: 3440, y: 2178 } as never);
    const workArea = {
      position: { x: 0, y: 78 },
      size: { width: 3600, height: 2260 },
    };
    vi.mocked(availableMonitors).mockResolvedValue([
      {
        position: { x: 0, y: 0 },
        size: { width: 3600, height: 2338 },
        workArea,
      },
    ] as never);
    expect(await getPetPointerState()).toEqual({
      cursor: { x: 3440, y: 2178 },
      scaleFactor: 2,
      workArea,
    });
  });

  it("selects a secondary monitor with a negative physical origin", async () => {
    vi.mocked(getCurrentWebviewWindow).mockReturnValue({
      scaleFactor: async () => 1,
    } as never);
    vi.mocked(cursorPosition).mockResolvedValue({ x: -900, y: -200 } as never);
    const workArea = {
      position: { x: -1920, y: -400 },
      size: { width: 1920, height: 1080 },
    };
    vi.mocked(availableMonitors).mockResolvedValue([
      {
        position: { x: 0, y: 0 },
        size: { width: 3600, height: 2338 },
        workArea: {},
      },
      {
        position: { x: -1920, y: -400 },
        size: { width: 1920, height: 1080 },
        workArea,
      },
    ] as never);
    expect((await getPetPointerState()).workArea).toEqual(workArea);
  });

  it("sends integer physical pixels to the native API for fractional cursor and inertia coordinates", async () => {
    const native = { setPosition: vi.fn() };
    vi.mocked(getCurrentWebviewWindow).mockReturnValue(native as never);
    // Native PhysicalPosition<i32> rejects fractional JSON coordinates.
    native.setPosition.mockImplementation(
      async (position: { x: number; y: number }) => {
        if (!Number.isInteger(position.x) || !Number.isInteger(position.y)) {
          throw new Error("invalid physical position");
        }
      },
    );
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      await setPetWebviewPosition(1223.7734375, 1643.6328125);
      expect(errors).not.toHaveBeenCalled();
      expect(native.setPosition).toHaveBeenLastCalledWith(
        expect.objectContaining({ x: 1224, y: 1644 }),
      );
      await setPetWebviewPosition(-1800.25, -399.75);
      expect(errors).not.toHaveBeenCalled();
      expect(native.setPosition).toHaveBeenLastCalledWith(
        expect.objectContaining({ x: -1800, y: -400 }),
      );
    } finally {
      errors.mockRestore();
    }
  });
});
