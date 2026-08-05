import { startCurrentWindowResize } from "../lib/tauriWindowApi";

export default function ChatResizeChrome() {
  return (
    <>
      <div
        className="chat-resize-edge chat-resize-edge-s"
        aria-hidden="true"
        onPointerDown={(event) => {
          event.preventDefault();
          void startCurrentWindowResize("South");
        }}
      />
      <div
        className="chat-resize-edge chat-resize-edge-e"
        aria-hidden="true"
        onPointerDown={(event) => {
          event.preventDefault();
          void startCurrentWindowResize("East");
        }}
      />
      <div
        className="chat-resize-handle"
        aria-label="调整窗口大小"
        title="拖动调整大小"
        onPointerDown={(event) => {
          event.preventDefault();
          void startCurrentWindowResize("SouthEast");
        }}
      />
    </>
  );
}
