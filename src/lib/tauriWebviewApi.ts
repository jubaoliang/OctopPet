import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  LogicalSize,
  PhysicalPosition,
  availableMonitors,
  cursorPosition,
  type Monitor,
} from "@tauri-apps/api/window";

export type PetWebviewWindow = ReturnType<typeof getCurrentWebviewWindow>;

export interface PetPointerState {
  cursor: { x: number; y: number };
  scaleFactor: number;
  workArea: Monitor["workArea"] | null;
}

export async function getPetPointerState(): Promise<PetPointerState> {
  const [cursor, scaleFactor, monitors] = await Promise.all([
    cursorPosition(),
    getPetWebviewWindow().scaleFactor(),
    availableMonitors(),
  ]);
  const monitor = monitors.find(
    ({ position, size }) =>
      cursor.x >= position.x &&
      cursor.x < position.x + size.width &&
      cursor.y >= position.y &&
      cursor.y < position.y + size.height,
  );
  return { cursor, scaleFactor, workArea: monitor?.workArea ?? null };
}

export function getPetWebviewWindow(): PetWebviewWindow {
  return getCurrentWebviewWindow();
}

// Windows `startDragging` enters the OS move loop (`WM_NCLBUTTONDOWN` /
// `HTCAPTION`). DWM then snapshots the 160×160 HWND with an opaque white
// client brush — WebView2 alpha is not in that preview. Move the window
// ourselves with `setPosition` instead.
export function petUsesManualDrag(): boolean {
  return /Windows/i.test(navigator.userAgent);
}

export function petSupportsManualMotion(): boolean {
  return /Windows|Macintosh|Mac OS X/i.test(navigator.userAgent);
}

export async function clearPetWebviewChrome(
  win: PetWebviewWindow = getPetWebviewWindow(),
): Promise<void> {
  // Windows: setShadow/setBackgroundColor rewrite HWND styles and bring back
  // the title bar. Chrome is owned by the native DWM path.
  if (petUsesManualDrag()) {
    return;
  }
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
    .setPosition(new PhysicalPosition(Math.round(x), Math.round(y)))
    .catch((error) => console.error("移动宠物位置失败", error));
}

export async function setPetWebviewLogicalSize(size: number): Promise<void> {
  await getPetWebviewWindow()
    .setSize(new LogicalSize(size, size))
    .catch((error) => console.error("调整宠物大小失败", error));
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
