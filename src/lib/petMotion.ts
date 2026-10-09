export function clampPetPosition(
  position: { x: number; y: number },
  physicalSize: number,
  workArea: {
    position: { x: number; y: number };
    size: { width: number; height: number };
  } | null,
): { x: number; y: number } {
  if (!workArea) return position;
  const { x: left, y: top } = workArea.position;
  const size = Math.round(physicalSize);
  const maxX = Math.max(left, left + workArea.size.width - size);
  const maxY = Math.max(top, top + workArea.size.height - size);
  return {
    x: Math.min(maxX, Math.max(left, position.x)),
    y: Math.min(maxY, Math.max(top, position.y)),
  };
}
