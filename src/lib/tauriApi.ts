import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

import type { AppConfig, MascotId } from "./types";

export const tauriApi = {
  loadConfig: () => invoke<AppConfig>("load_config"),
  saveConfig: (cfg: AppConfig) => invoke<void>("save_config", { cfg }),
  patchConfig: (patch: Partial<AppConfig>) =>
    invoke<void>("patch_config", { patch }),
  getSecret: (key: string) => invoke<string | null>("get_secret", { key }),
  setSecret: (key: string, value: string) =>
    invoke<void>("set_secret", { key, value }),
  deleteSecret: (key: string) => invoke<void>("delete_secret", { key }),
  openHome: (baseUrl: string) => invoke<void>("open_home", { baseUrl }),
  showChatNearPet: () => invoke<void>("show_chat_near_pet"),
  hideChat: () => invoke<void>("hide_chat"),
  hidePet: () => invoke<void>("hide_pet"),
  showSettings: () => invoke<void>("show_settings"),
  placeWindowBottomCenter: (label: string) =>
    invoke<void>("place_window_bottom_center", { label }),
  placeWindowCentered: (label: string) =>
    invoke<void>("place_window_centered", { label }),
  reloadHotkeys: () => invoke<void>("reload_hotkeys"),
  emitAuthUpdated: () => emit("auth-updated"),
  listenAuthUpdated: (handler: () => void) => listen("auth-updated", handler),
  listenChatShown: (handler: () => void) => listen("chat-shown", handler),
  listenWindowShown: (event: string, handler: () => void) =>
    listen(event, handler),
  emitMascotChanged: (mascotId: MascotId) => emit("mascot-changed", mascotId),
  listenMascotChanged: (handler: (mascotId: MascotId) => void) =>
    listen<MascotId>("mascot-changed", ({ payload }) => handler(payload)),
};
