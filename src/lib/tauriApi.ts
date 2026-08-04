import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

import type { AppConfig } from "./types";

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
  showSettings: () => invoke<void>("show_settings"),
  emitAuthUpdated: () => emit("auth-updated"),
  listenAuthUpdated: (handler: () => void) => listen("auth-updated", handler),
};
