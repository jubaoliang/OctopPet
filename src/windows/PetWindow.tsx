import { useEffect, useRef, useState } from "react";

import MascotImage from "../components/MascotImage";
import { DEFAULT_APP_CONFIG, MASCOT_SRC } from "../lib/configLogic";
import { showPetContextMenu } from "../lib/petContextMenu";
import { tauriApi } from "../lib/tauriApi";
import {
  clearPetWebviewChrome,
  getPetWebviewWindow,
  onPetWebviewFocusChanged,
  onPetWebviewMoved,
  setPetWebviewPosition,
  startPetWebviewDrag,
} from "../lib/tauriWebviewApi";
import type { AppConfig, MascotId } from "../lib/types";

const CLICK_MOVE_THRESHOLD = 4;

function clearPetSelection() {
  window.getSelection()?.removeAllRanges();
}

export default function PetWindow() {
  const [mascotId, setMascotId] = useState<MascotId>(
    DEFAULT_APP_CONFIG.mascotId,
  );
  const configRef = useRef<AppConfig>(DEFAULT_APP_CONFIG);
  const pointerDownRef = useRef(false);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const movedSincePointerDownRef = useRef(false);
  const dragStartedRef = useRef(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
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

      if (config.petX !== null && config.petY !== null) {
        await setPetWebviewPosition(config.petX, config.petY);
      }
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
        configRef.current = updatedConfig;
        saveQueueRef.current = saveQueueRef.current
          .then(() =>
            tauriApi.patchConfig({
              petX: position.x,
              petY: position.y,
            }),
          )
          .catch((error) => console.error("保存宠物位置失败", error));
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

    void initialize();

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;

    pointerDownRef.current = true;
    movedSincePointerDownRef.current = false;
    dragStartedRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!pointerDownRef.current) return;

    const distance = Math.hypot(
      event.clientX - pointerStartRef.current.x,
      event.clientY - pointerStartRef.current.y,
    );
    if (distance <= CLICK_MOVE_THRESHOLD) return;

    movedSincePointerDownRef.current = true;
    if (dragStartedRef.current) return;
    dragStartedRef.current = true;
    void startPetWebviewDrag();
  };

  const handleClick = () => {
    pointerDownRef.current = false;
    clearPetSelection();
    if (movedSincePointerDownRef.current) return;

    void clearPetWebviewChrome(getPetWebviewWindow());

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
      onPointerCancel={() => {
        pointerDownRef.current = false;
        dragStartedRef.current = false;
      }}
      onPointerUp={() => {
        if (dragStartedRef.current) {
          void clearPetWebviewChrome(getPetWebviewWindow());
        }
        pointerDownRef.current = false;
        dragStartedRef.current = false;
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        clearPetSelection();
      }}
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
    </main>
  );
}
