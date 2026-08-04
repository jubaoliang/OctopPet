import { listen } from "@tauri-apps/api/event";
import {
  getCurrentWindow,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";

import MascotImage from "../components/MascotImage";
import { DEFAULT_APP_CONFIG, MASCOT_SRC } from "../lib/configLogic";
import { tauriApi } from "../lib/tauriApi";
import type { AppConfig, MascotId } from "../lib/types";

const CLICK_MOVE_THRESHOLD = 4;

export default function PetWindow() {
  const [mascotId, setMascotId] = useState<MascotId>(
    DEFAULT_APP_CONFIG.mascotId,
  );
  const configRef = useRef<AppConfig>(DEFAULT_APP_CONFIG);
  const pointerDownRef = useRef(false);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const movedSincePointerDownRef = useRef(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const appWindow = getCurrentWindow();
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
      const config = await tauriApi.loadConfig().catch((error) => {
        console.error("加载宠物配置失败", error);
        return DEFAULT_APP_CONFIG;
      });
      if (disposed) return;

      configRef.current = config;
      setMascotId(config.mascotId);

      if (config.petX !== null && config.petY !== null) {
        await appWindow
          .setPosition(new PhysicalPosition(config.petX, config.petY))
          .catch((error) => console.error("恢复宠物位置失败", error));
      }
      if (disposed) return;

      await listen<MascotId>("mascot-changed", ({ payload }) => {
        configRef.current = { ...configRef.current, mascotId: payload };
        setMascotId(payload);
      })
        .then(registerUnlistener)
        .catch((error) => console.error("监听宠物切换失败", error));
      if (disposed) return;

      await appWindow
        .onMoved(({ payload: position }) => {
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
            .then(() => tauriApi.saveConfig(updatedConfig))
            .catch((error) => console.error("保存宠物位置失败", error));
        })
        .then(registerUnlistener)
        .catch((error) => console.error("监听宠物位置失败", error));
    };

    void initialize();

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    pointerDownRef.current = true;
    movedSincePointerDownRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!pointerDownRef.current) return;

    const distance = Math.hypot(
      event.clientX - pointerStartRef.current.x,
      event.clientY - pointerStartRef.current.y,
    );
    if (distance > CLICK_MOVE_THRESHOLD) {
      movedSincePointerDownRef.current = true;
    }
  };

  const handleClick = () => {
    pointerDownRef.current = false;
    if (movedSincePointerDownRef.current) return;

    void tauriApi
      .showChatNearPet()
      .catch((error) => console.error("打开聊天窗口失败", error));
  };

  return (
    <main
      className="pet-window"
      data-testid="pet-drag-region"
      data-tauri-drag-region
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerCancel={() => {
        pointerDownRef.current = false;
      }}
      onClick={handleClick}
    >
      <MascotImage src={MASCOT_SRC[mascotId]} />
    </main>
  );
}
