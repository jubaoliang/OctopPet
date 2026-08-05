import {
  LogicalSize,
  PhysicalPosition,
  getCurrentWindow,
} from "@tauri-apps/api/window";

export type ResizeEdge = "South" | "East" | "SouthEast";

export function getWindowLabel(): string {
  return getCurrentWindow().label;
}

export async function hideCurrentWindow(): Promise<void> {
  await getCurrentWindow().hide();
}

export async function applyBottomAnchoredSize(size: {
  width: number;
  height: number;
}): Promise<void> {
  const win = getCurrentWindow();
  const [oldSize, pos] = await Promise.all([
    win.outerSize(),
    win.outerPosition(),
  ]);
  await win.setSize(new LogicalSize(size.width, size.height));
  const newSize = await win.outerSize();
  const dy = oldSize.height - newSize.height;
  if (dy !== 0) {
    await win
      .setPosition(new PhysicalPosition(pos.x, pos.y + dy))
      .catch(() => undefined);
  }
}

export async function setCurrentWindowResizable(
  resizable: boolean,
): Promise<void> {
  await getCurrentWindow()
    .setResizable(resizable)
    .catch(() => undefined);
}

export async function clearCurrentWindowMaxSize(): Promise<void> {
  await getCurrentWindow()
    .setMaxSize(null)
    .catch(() => undefined);
}

export async function setCurrentWindowMinSize(
  width: number,
  height: number,
): Promise<void> {
  await getCurrentWindow()
    .setMinSize(new LogicalSize(width, height))
    .catch(() => undefined);
}

export async function setCurrentWindowSize(
  width: number,
  height: number,
): Promise<void> {
  await getCurrentWindow()
    .setSize(new LogicalSize(width, height))
    .catch(() => undefined);
}

export async function startCurrentWindowResize(
  edge: ResizeEdge,
): Promise<void> {
  await getCurrentWindow()
    .startResizeDragging(edge)
    .catch(() => undefined);
}

export async function startCurrentWindowDrag(): Promise<void> {
  await getCurrentWindow()
    .startDragging()
    .catch(() => undefined);
}

export async function getCurrentWindowOuterPosition(): Promise<PhysicalPosition> {
  return getCurrentWindow().outerPosition();
}

export async function setCurrentWindowOuterPosition(
  position: PhysicalPosition,
): Promise<void> {
  await getCurrentWindow()
    .setPosition(position)
    .catch(() => undefined);
}
