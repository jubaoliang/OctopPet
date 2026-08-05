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
  openHome: vi.fn(),
  listenMascotChanged: vi.fn(),
  clearPetWebviewChrome: vi.fn(),
  setPetWebviewPosition: vi.fn(),
  startPetWebviewDrag: vi.fn(),
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
    openHome: mocks.openHome,
    listenMascotChanged: mocks.listenMascotChanged,
  },
}));

vi.mock("../lib/tauriWebviewApi", () => ({
  clearPetWebviewChrome: mocks.clearPetWebviewChrome,
  setPetWebviewPosition: mocks.setPetWebviewPosition,
  startPetWebviewDrag: mocks.startPetWebviewDrag,
  onPetWebviewMoved: mocks.onPetWebviewMoved,
  onPetWebviewFocusChanged: mocks.onPetWebviewFocusChanged,
  getPetWebviewWindow: mocks.getPetWebviewWindow,
}));

vi.mock("../lib/petContextMenu", () => ({
  showPetContextMenu: mocks.showPetContextMenu,
}));

describe("PetWindow", () => {
  afterEach(cleanup);

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
    mocks.openHome.mockResolvedValue(undefined);
    mocks.listenMascotChanged.mockResolvedValue(vi.fn());
    mocks.clearPetWebviewChrome.mockResolvedValue(undefined);
    mocks.setPetWebviewPosition.mockResolvedValue(undefined);
    mocks.startPetWebviewDrag.mockResolvedValue(undefined);
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
    expect(mocks.setPetWebviewPosition).toHaveBeenCalledWith(120, 240);
  });

  it("opens chat on click without drag", async () => {
    render(<PetWindow />);
    await waitFor(() => expect(mocks.loadConfig).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("pet-drag-region"));

    await waitFor(() => expect(mocks.showChatNearPet).toHaveBeenCalledOnce());
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
