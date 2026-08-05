import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition } from "@tauri-apps/api/window";

export type PetWebviewWindow = ReturnType<typeof getCurrentWebviewWindow>;

export function getPetWebviewWindow(): PetWebviewWindow {
  return getCurrentWebviewWindow();
}

export async function clearPetWebviewChrome(
  win: PetWebviewWindow = getPetWebviewWindow(),
): Promise<void> {
  await Promise.all([
    win.setShadow(false).catch(() => undefined),
    win.setBackgroundColor([0, 0, 0, 0]).catch(() => undefined),
  ]);
}

export async function setPetWebviewPosition(
  x: number,
  y: number,
): Promise<void> {
  await getPetWebviewWindow()
    .setPosition(new PhysicalPosition(x, y))
    .catch((error) => console.error("恢复宠物位置失败", error));
}

export async function startPetWebviewDrag(): Promise<void> {
  await getPetWebviewWindow()
    .startDragging()
    .catch((error) => console.error("开始拖动失败", error));
}

export async function onPetWebviewMoved(
  handler: (position: { x: number; y: number }) => void,
): Promise<() => void> {
  return getPetWebviewWindow().onMoved(({ payload }) => handler(payload));
}

export async function onPetWebviewFocusChanged(
  handler: () => void,
): Promise<() => void> {
  return getPetWebviewWindow().onFocusChanged(handler);
}
