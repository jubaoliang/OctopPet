import { useEffect, useRef, useState } from "react";

import MascotImage from "../components/MascotImage";
import { DEFAULT_APP_CONFIG, MASCOT_SRC } from "../lib/configLogic";
import { showPetContextMenu } from "../lib/petContextMenu";
import { clampPetPosition } from "../lib/petMotion";
import { tauriApi } from "../lib/tauriApi";
import {
  clearPetWebviewChrome,
  getPetPointerState,
  getPetWebviewWindow,
  onPetWebviewFocusChanged,
  onPetWebviewMoved,
  petSupportsManualMotion,
  setPetWebviewLogicalSize,
  setPetWebviewPosition,
  startPetWebviewDrag,
  type PetPointerState,
} from "../lib/tauriWebviewApi";
import type { AppConfig, MascotId } from "../lib/types";

const CLICK_MOVE_THRESHOLD = 4;
const MIN_PET_SIZE = 80;
const MAX_PET_SIZE = 224;
const GLIDE_STOP_SPEED = 0.02;
const GLIDE_MAX_SPEED = 1.4;
const GLIDE_FRICTION_PER_FRAME = 0.88;

interface PointerSample {
  x: number;
  y: number;
  time: number;
}

function clearPetSelection() {
  window.getSelection()?.removeAllRanges();
}

function clampPetSize(size: number) {
  return Math.min(MAX_PET_SIZE, Math.max(MIN_PET_SIZE, Math.round(size)));
}

export default function PetWindow() {
  const [mascotId, setMascotId] = useState<MascotId>(
    DEFAULT_APP_CONFIG.mascotId,
  );
  const configRef = useRef<AppConfig>(DEFAULT_APP_CONFIG);
  const pointerDownRef = useRef(false);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const grabOffsetRef = useRef({ x: 0, y: 0 });
  const lastPositionRef = useRef({ x: 0, y: 0 });
  const pointerStateRef = useRef<PetPointerState | null>(null);
  const pointerSequenceRef = useRef(0);
  const pendingPointerMoveRef = useRef<Promise<void>>(Promise.resolve());
  const pointerSamplesRef = useRef<PointerSample[]>([]);
  const glideFrameRef = useRef<number | null>(null);
  const petSizeRef = useRef(DEFAULT_APP_CONFIG.petSize);
  const resizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, y: 0, size: 160 });
  const movedSincePointerDownRef = useRef(false);
  const dragStartedRef = useRef(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const positionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastOpenAtRef = useRef(0);

  useEffect(() => {
    const appWindow = getPetWebviewWindow();
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const registerUnlistener = (unlisten: () => void) => {
      if (disposed) {
        unlisten();
      } else {
        unlisteners.push(unlisten);
      }
    };

    const initialize = async () => {
      await clearPetWebviewChrome(appWindow);

      const config = await tauriApi.loadConfig().catch((error) => {
        console.error("加载宠物配置失败", error);
        return DEFAULT_APP_CONFIG;
      });
      if (disposed) return;

      configRef.current = config;
      setMascotId(config.mascotId);
      petSizeRef.current = clampPetSize(config.petSize);
      await setPetWebviewLogicalSize(petSizeRef.current);

      lastPositionRef.current = await tauriApi.restorePetPosition();
      if (disposed) return;

      await tauriApi
        .listenMascotChanged((payload) => {
          configRef.current = { ...configRef.current, mascotId: payload };
          setMascotId(payload);
        })
        .then(registerUnlistener)
        .catch((error) => console.error("监听宠物切换失败", error));
      if (disposed) return;

      await onPetWebviewFocusChanged(() => {
        void clearPetWebviewChrome(appWindow);
      })
        .then(registerUnlistener)
        .catch((error) => console.error("监听宠物焦点失败", error));
      if (disposed) return;

      await onPetWebviewMoved((position) => {
        if (pointerDownRef.current) {
          movedSincePointerDownRef.current = true;
        }

        const updatedConfig = {
          ...configRef.current,
          petX: position.x,
          petY: position.y,
        };
        lastPositionRef.current = position;
        configRef.current = updatedConfig;
        if (positionSaveTimerRef.current !== null) {
          clearTimeout(positionSaveTimerRef.current);
        }
        positionSaveTimerRef.current = setTimeout(() => {
          positionSaveTimerRef.current = null;
          saveQueueRef.current = saveQueueRef.current
            .then(() =>
              tauriApi.patchConfig({
                petX: position.x,
                petY: position.y,
              }),
            )
            .catch((error) => console.error("保存宠物位置失败", error));
        }, 120);
      })
        .then(registerUnlistener)
        .catch((error) => console.error("监听宠物位置失败", error));

      const onVisibility = () => {
        if (document.visibilityState === "visible") {
          void clearPetWebviewChrome(appWindow);
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      registerUnlistener(() =>
        document.removeEventListener("visibilitychange", onVisibility),
      );
    };

    const onSelectStart = (event: Event) => event.preventDefault();
    document.addEventListener("selectstart", onSelectStart);
    registerUnlistener(() =>
      document.removeEventListener("selectstart", onSelectStart),
    );

    void initialize();

    return () => {
      disposed = true;
      pointerSequenceRef.current += 1;
      if (glideFrameRef.current !== null) {
        cancelAnimationFrame(glideFrameRef.current);
      }
      if (positionSaveTimerRef.current !== null) {
        clearTimeout(positionSaveTimerRef.current);
      }
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const handlePointerDown = async (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;

    if (glideFrameRef.current !== null) {
      cancelAnimationFrame(glideFrameRef.current);
      glideFrameRef.current = null;
    }
    clearPetSelection();
    const sequence = ++pointerSequenceRef.current;
    pointerDownRef.current = true;
    movedSincePointerDownRef.current = false;
    dragStartedRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    grabOffsetRef.current = { x: event.clientX, y: event.clientY };
    pointerSamplesRef.current = [];
    if (petSupportsManualMotion() && event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (petSupportsManualMotion()) {
      const state = await getPetPointerState();
      if (sequence !== pointerSequenceRef.current) return;
      pointerStateRef.current = state;
      pointerSamplesRef.current = [
        { ...state.cursor, time: performance.now() },
      ];
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!pointerDownRef.current) return;

    const distance = Math.hypot(
      event.clientX - pointerStartRef.current.x,
      event.clientY - pointerStartRef.current.y,
    );
    if (distance <= CLICK_MOVE_THRESHOLD && !dragStartedRef.current) return;

    movedSincePointerDownRef.current = true;
    if (petSupportsManualMotion()) {
      dragStartedRef.current = true;
      const sequence = pointerSequenceRef.current;
      pendingPointerMoveRef.current = getPetPointerState()
        .then(async (state) => {
          if (sequence !== pointerSequenceRef.current) return;
          pointerStateRef.current = state;
          // Native cursor/move events and saved coordinates are physical pixels.
          // Only the grab offset from the DOM needs the window's DPI conversion.
          const position = clampPetPosition(
            {
              x: state.cursor.x - grabOffsetRef.current.x * state.scaleFactor,
              y: state.cursor.y - grabOffsetRef.current.y * state.scaleFactor,
            },
            petSizeRef.current * state.scaleFactor,
            state.workArea,
          );
          lastPositionRef.current = position;
          const now = performance.now();
          pointerSamplesRef.current = [
            ...pointerSamplesRef.current.filter(
              (sample) => now - sample.time <= 100,
            ),
            { ...state.cursor, time: now },
          ].slice(-6);
          await setPetWebviewPosition(position.x, position.y);
        })
        .catch((error) => console.error("读取宠物拖动位置失败", error));
      return;
    }
    if (dragStartedRef.current) return;
    dragStartedRef.current = true;
    void startPetWebviewDrag();
  };

  const startGlide = () => {
    const samples = pointerSamplesRef.current;
    const state = pointerStateRef.current;
    if (samples.length < 2 || !state) return;
    const stopSpeed = GLIDE_STOP_SPEED * state.scaleFactor;
    const maxSpeed = GLIDE_MAX_SPEED * state.scaleFactor;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsed = Math.max(1, last.time - first.time);
    let vx = (last.x - first.x) / elapsed;
    let vy = (last.y - first.y) / elapsed;
    const speed = Math.hypot(vx, vy);
    if (speed < stopSpeed) return;
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      vx *= scale;
      vy *= scale;
    }

    let previousTime = performance.now();
    const step = (now: number) => {
      const elapsedMs = Math.min(32, now - previousTime);
      previousTime = now;
      const friction = Math.pow(
        GLIDE_FRICTION_PER_FRAME,
        elapsedMs / (1000 / 60),
      );
      vx *= friction;
      vy *= friction;
      let position = {
        x: lastPositionRef.current.x + vx * elapsedMs,
        y: lastPositionRef.current.y + vy * elapsedMs,
      };
      const clamped = clampPetPosition(
        position,
        petSizeRef.current * state.scaleFactor,
        state.workArea,
      );
      if (clamped.x !== position.x) vx = 0;
      if (clamped.y !== position.y) vy = 0;
      position = clamped;
      lastPositionRef.current = position;
      void setPetWebviewPosition(position.x, position.y);

      if (Math.hypot(vx, vy) > stopSpeed) {
        glideFrameRef.current = requestAnimationFrame(step);
      } else {
        glideFrameRef.current = null;
        void clearPetWebviewChrome(getPetWebviewWindow());
      }
    };
    glideFrameRef.current = requestAnimationFrame(step);
  };

  const endPointer = async (event: React.PointerEvent<HTMLElement>) => {
    const dragged = dragStartedRef.current;
    const sequence = pointerSequenceRef.current;
    const canceled = event.type === "pointercancel";
    pointerDownRef.current = false;
    dragStartedRef.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (dragged) {
      void clearPetWebviewChrome(getPetWebviewWindow());
      if (petSupportsManualMotion() && !canceled) {
        // Do not discard the final native cursor query when release beats IPC.
        await pendingPointerMoveRef.current;
        if (sequence === pointerSequenceRef.current) startGlide();
      }
    }
  };

  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (glideFrameRef.current !== null) {
      cancelAnimationFrame(glideFrameRef.current);
      glideFrameRef.current = null;
    }
    resizingRef.current = true;
    resizeStartRef.current = {
      x: event.screenX,
      y: event.screenY,
      size: petSizeRef.current,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleResizePointerMove = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (!resizingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = Math.max(
      event.screenX - resizeStartRef.current.x,
      event.screenY - resizeStartRef.current.y,
    );
    const size = clampPetSize(resizeStartRef.current.size + delta);
    if (size === petSizeRef.current) return;
    petSizeRef.current = size;
    void setPetWebviewLogicalSize(size);
  };

  const endResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    resizingRef.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const petSize = petSizeRef.current;
    configRef.current = { ...configRef.current, petSize };
    void tauriApi
      .patchConfig({ petSize })
      .catch((error) => console.error("保存宠物大小失败", error));
  };

  const handleClick = () => {
    pointerDownRef.current = false;
    clearPetSelection();
    if (movedSincePointerDownRef.current) return;

    const now = Date.now();
    if (now - lastOpenAtRef.current < 400) return;
    lastOpenAtRef.current = now;

    void tauriApi
      .showChatNearPet()
      .catch((error) => console.error("打开聊天窗口失败", error));
  };

  return (
    <main
      className="pet-window"
      data-testid="pet-drag-region"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerCancel={endPointer}
      onPointerUp={endPointer}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        clearPetSelection();
      }}
      onDragStart={(event) => event.preventDefault()}
      onClick={handleClick}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void showPetContextMenu().catch((error) =>
          console.error("打开桌宠菜单失败", error),
        );
      }}
    >
      <MascotImage src={MASCOT_SRC[mascotId]} />
      <button
        className="pet-resize-handle"
        type="button"
        aria-label="调整宠物大小"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
    </main>
  );
}
