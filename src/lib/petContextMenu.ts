import { Menu, MenuItem } from "@tauri-apps/api/menu";

import { tauriApi } from "./tauriApi";

export async function showPetContextMenu(): Promise<void> {
  const menu = await Menu.new({
    items: [
      await MenuItem.new({
        id: "pet-chat",
        text: "与Octop 对话",
        action: () => {
          void tauriApi
            .showChatNearPet()
            .catch((error) => console.error("打开对话失败", error));
        },
      }),
      await MenuItem.new({
        id: "pet-home",
        text: "打开服务主页",
        action: () => {
          void (async () => {
            try {
              const config = await tauriApi.loadConfig();
              await tauriApi.openHome(config.baseUrl);
            } catch (error) {
              console.error("打开服务主页失败", error);
            }
          })();
        },
      }),
      await MenuItem.new({
        id: "pet-settings",
        text: "打开设置",
        action: () => {
          void tauriApi
            .showSettings()
            .catch((error) => console.error("打开设置失败", error));
        },
      }),
      await MenuItem.new({
        id: "pet-close",
        text: "关闭",
        action: () => {
          void tauriApi
            .hidePet()
            .catch((error) => console.error("关闭桌宠失败", error));
        },
      }),
    ],
  });
  await menu.popup();
}
