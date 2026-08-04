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
  startDragging: vi.fn(),
  setPosition: vi.fn(),
  listen: vi.fn(),
  onMoved: vi.fn(),
}));

vi.mock("../lib/tauriApi", () => ({
  tauriApi: {
    loadConfig: mocks.loadConfig,
    patchConfig: mocks.patchConfig,
    showChatNearPet: mocks.showChatNearPet,
  },
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mocks.listen,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onMoved: mocks.onMoved,
    setPosition: mocks.setPosition,
    startDragging: mocks.startDragging,
  }),
  PhysicalPosition: class PhysicalPosition {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
}));

describe("PetWindow", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockResolvedValue({ ...DEFAULT_APP_CONFIG });
    mocks.patchConfig.mockResolvedValue(undefined);
    mocks.showChatNearPet.mockResolvedValue(undefined);
    mocks.startDragging.mockResolvedValue(undefined);
    mocks.setPosition.mockResolvedValue(undefined);
    mocks.listen.mockResolvedValue(vi.fn());
    mocks.onMoved.mockResolvedValue(vi.fn());
  });

  it("loads the configured mascot and reacts to mascot changes", async () => {
    let mascotChanged:
      | ((event: { payload: "peek" | "type" }) => void)
      | undefined;
    mocks.loadConfig.mockResolvedValue({
      ...DEFAULT_APP_CONFIG,
      mascotId: "peek",
    });
    mocks.listen.mockImplementation(
      async (_event: string, handler: typeof mascotChanged) => {
        mascotChanged = handler;
        return vi.fn();
      },
    );

    render(<PetWindow />);

    expect(await screen.findByRole("img", { name: "Octop 宠物" })).toHaveAttribute(
      "src",
      "/mascots/peek.webp",
    );

    act(() => mascotChanged?.({ payload: "type" }));

    expect(screen.getByRole("img", { name: "Octop 宠物" })).toHaveAttribute(
      "src",
      "/mascots/type.webp",
    );
  });

  it("waits for config before accepting position changes", async () => {
    let resolveConfig:
      | ((config: typeof DEFAULT_APP_CONFIG) => void)
      | undefined;
    mocks.loadConfig.mockReturnValue(
      new Promise((resolve) => {
        resolveConfig = resolve;
      }),
    );

    render(<PetWindow />);

    expect(mocks.onMoved).not.toHaveBeenCalled();

    act(() => resolveConfig?.({ ...DEFAULT_APP_CONFIG }));
    await waitFor(() => expect(mocks.onMoved).toHaveBeenCalledOnce());
  });

  it("uses a native drag region and opens chat when the window did not move", async () => {
    render(<PetWindow />);
    const pet = await screen.findByTestId("pet-drag-region");

    fireEvent.pointerDown(pet, { clientX: 10, clientY: 10 });
    expect(pet).toHaveAttribute("data-tauri-drag-region");
    expect(mocks.startDragging).not.toHaveBeenCalled();
    fireEvent.click(pet);

    expect(mocks.showChatNearPet).toHaveBeenCalledOnce();
  });

  it("restores and saves the pet position while suppressing drag clicks", async () => {
    let moved:
      | ((event: { payload: { x: number; y: number } }) => void)
      | undefined;
    mocks.loadConfig.mockResolvedValue({
      ...DEFAULT_APP_CONFIG,
      petX: 40,
      petY: 60,
    });
    mocks.onMoved.mockImplementation(async (handler: typeof moved) => {
      moved = handler;
      return vi.fn();
    });

    render(<PetWindow />);
    const pet = await screen.findByTestId("pet-drag-region");

    await waitFor(() =>
      expect(mocks.setPosition).toHaveBeenCalledWith(
        expect.objectContaining({ x: 40, y: 60 }),
      ),
    );

    fireEvent.pointerDown(pet, { clientX: 10, clientY: 10 });
    act(() => moved?.({ payload: { x: 120, y: 140 } }));

    await waitFor(() =>
      expect(mocks.patchConfig).toHaveBeenCalledWith({
        petX: 120,
        petY: 140,
      }),
    );

    fireEvent.click(pet);
    expect(mocks.showChatNearPet).not.toHaveBeenCalled();
  });
});
