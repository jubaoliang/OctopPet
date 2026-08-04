import { useEffect, useState } from "react";

import { normalizeBaseUrl } from "../lib/configLogic";
import { login } from "../lib/octopHttp";
import { tauriApi } from "../lib/tauriApi";
import type { AppConfig } from "../lib/types";

type Notice = { kind: "success" | "error"; text: string } | null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function SettingsWindow() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([tauriApi.loadConfig(), tauriApi.getSecret("password")])
      .then(([loadedConfig, savedPassword]) => {
        if (!active) return;
        setConfig(loadedConfig);
        setBaseUrl(loadedConfig.baseUrl);
        setUsername(loadedConfig.username);
        setPassword(savedPassword ?? "");
      })
      .catch((error: unknown) => {
        if (active) {
          setNotice({
            kind: "error",
            text: `加载设置失败：${errorMessage(error)}`,
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function saveSettings() {
    if (!config) return;

    setBusy("save");
    setNotice(null);
    try {
      const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
      const nextConfig = {
        ...config,
        baseUrl: normalizedBaseUrl,
        username,
      };
      await tauriApi.saveConfig(nextConfig);
      await tauriApi.setSecret("password", password);
      setConfig(nextConfig);
      setBaseUrl(normalizedBaseUrl);
      setNotice({ kind: "success", text: "设置已保存" });
    } catch (error) {
      setNotice({
        kind: "error",
        text: `保存失败：${errorMessage(error)}`,
      });
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy("test");
    setNotice(null);
    try {
      const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
      const { access_token } = await login(
        normalizedBaseUrl,
        username,
        password,
      );
      await tauriApi.setSecret("access_token", access_token);
      setNotice({ kind: "success", text: "连接成功" });
    } catch (error) {
      setNotice({
        kind: "error",
        text: `连接失败：${errorMessage(error)}`,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="settings-window">
      <h1>Octop 设置</h1>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void saveSettings();
        }}
      >
        <label htmlFor="base-url">服务地址</label>
        <input
          id="base-url"
          type="url"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.currentTarget.value)}
          placeholder="https://octop.example.com"
          autoComplete="url"
        />

        <label htmlFor="username">用户名</label>
        <input
          id="username"
          value={username}
          onChange={(event) => setUsername(event.currentTarget.value)}
          autoComplete="username"
        />

        <label htmlFor="password">密码</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          autoComplete="current-password"
        />

        <div className="settings-actions">
          <button type="submit" disabled={!config || busy !== null}>
            {busy === "save" ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            disabled={!config || busy !== null}
            onClick={() => void testConnection()}
          >
            {busy === "test" ? "测试中…" : "测试连接"}
          </button>
        </div>
      </form>

      {notice && (
        <p
          className={`settings-notice settings-notice--${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {notice.text}
        </p>
      )}
    </main>
  );
}
