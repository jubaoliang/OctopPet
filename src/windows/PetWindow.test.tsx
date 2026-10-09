// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "../lib/configLogic";
import PetWindow from "./PetWindow";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  patchConfig: vi.fn(),
  showChatNearPet: vi.fn(),
  showSettings: vi.fn(),
  hidePet: vi.fn(),
  restorePetPosition: vi.fn(),
  openHome: vi.fn(),
  listenMascotChanged: vi.fn(),
  clearPetWebviewChrome: vi.fn(),
  setPetWebviewPosition: vi.fn(),
  startPetWebviewDrag: vi.fn(),
  getPetPointerState: vi.fn(),
  setPetWebviewLogicalSize: vi.fn(),
  petSupportsManualMotion: vi.fn(),
  onPetWebviewMoved: vi.fn(),
  onPetWebviewFocusChanged: vi.fn(),
  getPetWebviewWindow: vi.fn(),
  showPetContextMenu: vi.fn(),
}));

vi.mock("../lib/tauriApi", () => ({
  tauriApi: {
    loadConfig: mocks.loadConfig,
    patchConfig: mocks.patchConfig,
    showChatNearPet: mocks.showChatNearPet,
    showSettings: mocks.showSettings,
    hidePet: mocks.hidePet,
    restorePetPosition: mocks.restorePetPosition,
    openHome: mocks.openHome,
    listenMascotChanged: mocks.listenMascotChanged,
  },
}));

vi.mock("../lib/tauriWebviewApi", () => ({
  clearPetWebviewChrome: mocks.clearPetWebviewChrome,
  setPetWebviewPosition: mocks.setPetWebviewPosition,
  startPetWebviewDrag: mocks.startPetWebviewDrag,
  getPetPointerState: mocks.getPetPointerState,
  setPetWebviewLogicalSize: mocks.setPetWebviewLogicalSize,
  petSupportsManualMotion: mocks.petSupportsManualMotion,
  onPetWebviewMoved: mocks.onPetWebviewMoved,
  onPetWebviewFocusChanged: mocks.onPetWebviewFocusChanged,
  getPetWebviewWindow: mocks.getPetWebviewWindow,
}));

vi.mock("../lib/petContextMenu", () => ({
  showPetContextMenu: mocks.showPetContextMenu,
}));

describe("PetWindow", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockResolvedValue({
      ...DEFAULT_APP_CONFIG,
      mascotId: "type",
      petX: 120,
      petY: 240,
    });
    mocks.patchConfig.mockResolvedValue(undefined);
    mocks.showChatNearPet.mockResolvedValue(undefined);
    mocks.showSettings.mockResolvedValue(undefined);
    mocks.hidePet.mockResolvedValue(undefined);
    mocks.restorePetPosition.mockResolvedValue({ x: 120, y: 240 });
    mocks.openHome.mockResolvedValue(undefined);
    mocks.listenMascotChanged.mockResolvedValue(vi.fn());
    mocks.clearPetWebviewChrome.mockResolvedValue(undefined);
    mocks.setPetWebviewPosition.mockResolvedValue(undefined);
    mocks.startPetWebviewDrag.mockResolvedValue(undefined);
    mocks.getPetPointerState
      .mockReset()
      .mockResolvedValueOnce({
        cursor: { x: 100, y: 200 },
        scaleFactor: 1,
        workArea: {
          position: { x: 0, y: 0 },
          size: { width: 1200, height: 900 },
        },
      })
      .mockResolvedValue({
        cursor: { x: 120, y: 200 },
        scaleFactor: 1,
        workArea: {
          position: { x: 0, y: 0 },
          size: { width: 1200, height: 900 },
        },
      });
    mocks.setPetWebviewLogicalSize.mockResolvedValue(undefined);
    mocks.petSupportsManualMotion.mockReturnValue(false);
    mocks.showPetContextMenu.mockResolvedValue(undefined);
    mocks.getPetWebviewWindow.mockReturnValue({});
    mocks.onPetWebviewMoved.mockImplementation(async (handler) => {
      await Promise.resolve();
      handler({ x: 130, y: 250 });
      return vi.fn();
    });
    mocks.onPetWebviewFocusChanged.mockResolvedValue(vi.fn());
  });

  it("loads mascot from config on mount", async () => {
    render(<PetWindow />);
    await waitFor(() => expect(mocks.loadConfig).toHaveBeenCalledOnce());
    expect(mocks.setPetWebviewLogicalSize).toHaveBeenCalledWith(160);
    expect(mocks.restorePetPosition).toHaveBeenCalledOnce();
    expect(mocks.setPetWebviewPosition).not.toHaveBeenCalled();
  });

  it("opens chat on click without drag", async () => {
    render(<PetWindow />);
    await waitFor(() => expect(mocks.loadConfig).toHaveBeenCalled());

    mocks.clearPetWebviewChrome.mockClear();
    fireEvent.click(screen.getByTestId("pet-drag-region"));

    await waitFor(() => expect(mocks.showChatNearPet).toHaveBeenCalledOnce());
    expect(mocks.clearPetWebviewChrome).not.toHaveBeenCalled();
  });

  it("blocks text selection on the pet surface", () => {
    render(<PetWindow />);

    const event = new Event("selectstart", { bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("starts drag after pointer moves beyond threshold", async () => {
    render(<PetWindow />);
    await waitFor(() => expect(mocks.loadConfig).toHaveBeenCalled());

    const region = screen.getByTestId("pet-drag-region");
    fireEvent.pointerDown(region, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.pointerMove(region, { clientX: 20, clientY: 0, button: 0 });

    await waitFor(() =>
      expect(mocks.startPetWebviewDrag).toHaveBeenCalledOnce(),
    );
    expect(mocks.setPetWebviewPosition).not.toHaveBeenCalled();
  });

  it("moves the window with setPosition on Windows instead of OS drag", async () => {
    mocks.petSupportsManualMotion.mockReturnValue(true);
    render(<PetWindow />);
    await waitFor(() => expect(mocks.loadConfig).toHaveBeenCalled());

    const region = screen.getByTestId("pet-drag-region");
    fireEvent.pointerDown(region, {
      clientX: 10,
      clientY: 12,
      screenX: 100,
      screenY: 200,
      button: 0,
    });
    fireEvent.pointerMove(region, {
      clientX: 30,
      clientY: 12,
      screenX: 120,
      screenY: 200,
      button: 0,
    });

    await waitFor(() =>
      expect(mocks.setPetWebviewPosition).toHaveBeenCalledWith(110, 188),
    );
    expect(mocks.startPetWebviewDrag).not.toHaveBeenCalled();
  });

  it("keeps moving briefly with inertia after a manual drag is released", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(50)
      .mockReturnValue(50);
    mocks.petSupportsManualMotion.mockReturnValue(true);
    render(<PetWindow />);
    await waitFor(() => expect(mocks.loadConfig).toHaveBeenCalled());

    const region = screen.getByTestId("pet-drag-region");
    fireEvent.pointerDown(region, {
      clientX: 10,
      clientY: 12,
      screenX: 100,
      screenY: 200,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerMove(region, {
      clientX: 30,
      clientY: 12,
      screenX: 120,
      screenY: 200,
      pointerId: 1,
      button: 0,
    });
    await waitFor(() =>
      expect(mocks.setPetWebviewPosition).toHaveBeenCalledWith(110, 188),
    );
    fireEvent.pointerUp(region, { pointerId: 1 });

    await waitFor(() => expect(frames).toHaveLength(1));
    act(() => frames.shift()?.(66));
    const lastCall = mocks.setPetWebviewPosition.mock.calls.at(-1);
    expect(lastCall?.[0]).toBeGreaterThan(110);
    expect(lastCall?.[1]).toBe(188);
  });

  it("keeps Retina drag and move events in physical pixels throughout inertia", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(50)
      .mockReturnValue(50);
    let moved: ((position: { x: number; y: number }) => void) | undefined;
    mocks.onPetWebviewMoved.mockImplementation(async (handler) => {
      moved = handler;
      return vi.fn();
    });
    const state = {
      scaleFactor: 2,
      workArea: {
        position: { x: 0, y: 78 },
        size: { width: 3600, height: 2160 },
      },
    };
    mocks.getPetPointerState
      .mockReset()
      .mockResolvedValueOnce({ ...state, cursor: { x: 200, y: 400 } })
      .mockResolvedValue({ ...state, cursor: { x: 240, y: 400 } });
    mocks.petSupportsManualMotion.mockReturnValue(true);
    render(<PetWindow />);
    await waitFor(() => expect(moved).toBeDefined());
    const region = screen.getByTestId("pet-drag-region");
    fireEvent.pointerDown(region, {
      clientX: 10,
      clientY: 12,
      screenX: 100,
      screenY: 200,
      button: 0,
    });
    fireEvent.pointerMove(region, {
      clientX: 30,
      clientY: 12,
      screenX: 120,
      screenY: 200,
    });
    await waitFor(() =>
      expect(mocks.setPetWebviewPosition).toHaveBeenCalledWith(220, 376),
    );
    act(() => moved?.({ x: 220, y: 376 }));
    fireEvent.pointerUp(region);
    await waitFor(() => expect(frames).toHaveLength(1));
    let previousX = 220;
    for (const time of [66, 82, 98]) {
      act(() => frames.shift()?.(time));
      const [x, y] = mocks.setPetWebviewPosition.mock.calls.at(-1)!;
      expect(x).toBeGreaterThan(previousX);
      expect(x - previousX).toBeLessThan(45);
      expect(y).toBe(376);
      previousX = x;
      act(() => moved?.({ x, y }));
    }
  });

  it("clamps inertia to the native secondary-monitor work area", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(50)
      .mockReturnValue(50);
    const state = {
      scaleFactor: 2,
      workArea: {
        position: { x: -1800, y: -400 },
        size: { width: 1800, height: 1200 },
      },
    };
    mocks.getPetPointerState
      .mockReset()
      .mockResolvedValueOnce({ ...state, cursor: { x: -30, y: 450 } })
      .mockResolvedValue({ ...state, cursor: { x: -10, y: 480 } });
    mocks.petSupportsManualMotion.mockReturnValue(true);
    render(<PetWindow />);
    await waitFor(() => expect(mocks.restorePetPosition).toHaveBeenCalled());
    const region = screen.getByTestId("pet-drag-region");
    fireEvent.pointerDown(region, { clientX: 10, clientY: 0, button: 0 });
    fireEvent.pointerMove(region, { clientX: 30, clientY: 0 });
    await waitFor(() =>
      expect(mocks.setPetWebviewPosition).toHaveBeenCalledWith(-320, 480),
    );
    fireEvent.pointerUp(region);
    await waitFor(() => expect(frames).toHaveLength(1));
    act(() => frames.shift()?.(66));
    expect(mocks.setPetWebviewPosition).toHaveBeenLastCalledWith(-320, 480);
  });

  it("applies the final cursor query even when a short drag is released before IPC resolves", async () => {
    let resolveState:
      | ((value: Awaited<ReturnType<typeof mocks.getPetPointerState>>) => void)
      | undefined;
    mocks.getPetPointerState
      .mockReset()
      .mockResolvedValueOnce({
        cursor: { x: 200, y: 400 },
        scaleFactor: 2,
        workArea: null,
      })
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveState = resolve;
          }),
      );
    mocks.petSupportsManualMotion.mockReturnValue(true);
    render(<PetWindow />);
    await waitFor(() => expect(mocks.restorePetPosition).toHaveBeenCalled());
    const region = screen.getByTestId("pet-drag-region");
    fireEvent.pointerDown(region, { clientX: 10, clientY: 12, button: 0 });
    fireEvent.pointerMove(region, { clientX: 30, clientY: 12 });
    fireEvent.pointerUp(region);
    await act(async () =>
      resolveState?.({
        cursor: { x: 200, y: 400 },
        scaleFactor: 2,
        workArea: null,
      }),
    );
    expect(mocks.setPetWebviewPosition).toHaveBeenLastCalledWith(180, 376);
  });

  it("keeps a slow drag inside the work area even when there is no inertia", async () => {
    mocks.getPetPointerState.mockReset().mockResolvedValue({
      cursor: { x: 3440, y: 2178 },
      scaleFactor: 2,
      workArea: {
        position: { x: 0, y: 78 },
        size: { width: 3600, height: 2260 },
      },
    });
    mocks.petSupportsManualMotion.mockReturnValue(true);
    render(<PetWindow />);
    await waitFor(() => expect(mocks.restorePetPosition).toHaveBeenCalled());
    const region = screen.getByTestId("pet-drag-region");
    fireEvent.pointerDown(region, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.pointerMove(region, { clientX: 20, clientY: 20 });
    fireEvent.pointerUp(region);
    await waitFor(() =>
      expect(mocks.setPetWebviewPosition).toHaveBeenLastCalledWith(3280, 2018),
    );
  });

  it("resizes from the bottom-right hover handle and persists the size", async () => {
    render(<PetWindow />);
    await waitFor(() => expect(mocks.loadConfig).toHaveBeenCalled());

    const handle = screen.getByRole("button", { name: "调整宠物大小" });
    fireEvent.pointerDown(handle, {
      screenX: 100,
      screenY: 100,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerMove(handle, {
      screenX: 140,
      screenY: 130,
      pointerId: 1,
    });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    await waitFor(() =>
      expect(mocks.setPetWebviewLogicalSize).toHaveBeenCalledWith(200),
    );
    expect(mocks.patchConfig).toHaveBeenCalledWith({ petSize: 200 });
    expect(mocks.showChatNearPet).not.toHaveBeenCalled();
  });

  it("does not open chat after a drag click", async () => {
    render(<PetWindow />);
    await waitFor(() => expect(mocks.loadConfig).toHaveBeenCalled());

    const region = screen.getByTestId("pet-drag-region");
    fireEvent.pointerDown(region, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.pointerMove(region, { clientX: 20, clientY: 0, button: 0 });
    fireEvent.click(region);

    expect(mocks.showChatNearPet).not.toHaveBeenCalled();
  });

  it("debounces rapid chat opens", async () => {
    vi.useFakeTimers();
    render(<PetWindow />);
    await act(async () => {
      await Promise.resolve();
    });

    const region = screen.getByTestId("pet-drag-region");
    fireEvent.click(region);
    fireEvent.click(region);

    expect(mocks.showChatNearPet).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("persists position when webview moves", async () => {
    render(<PetWindow />);
    await waitFor(() =>
      expect(mocks.patchConfig).toHaveBeenCalledWith({
        petX: 130,
        petY: 250,
      }),
    );
  });

  it("shows native context menu on right click", async () => {
    render(<PetWindow />);
    await waitFor(() => expect(mocks.loadConfig).toHaveBeenCalled());

    fireEvent.contextMenu(screen.getByTestId("pet-drag-region"));

    await waitFor(() =>
      expect(mocks.showPetContextMenu).toHaveBeenCalledOnce(),
    );
  });

  it("syncs mascot from mascot-changed event", async () => {
    let mascotHandler: ((id: "peek" | "type") => void) | undefined;
    mocks.listenMascotChanged.mockImplementation(async (handler) => {
      mascotHandler = handler;
      return vi.fn();
    });

    render(<PetWindow />);
    await waitFor(() => expect(mascotHandler).toBeDefined());

    act(() => mascotHandler?.("peek"));

    await waitFor(() =>
      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        "/mascots/peek.webp",
      ),
    );
  });

  it("clears transparent chrome on focus changes", async () => {
    let focusHandler: (() => void) | undefined;
    mocks.onPetWebviewFocusChanged.mockImplementation(async (handler) => {
      focusHandler = handler;
      return vi.fn();
    });

    render(<PetWindow />);
    await waitFor(() => expect(focusHandler).toBeDefined());

    mocks.clearPetWebviewChrome.mockClear();
    act(() => focusHandler?.());

    await waitFor(() => expect(mocks.clearPetWebviewChrome).toHaveBeenCalled());
  });
});
