// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "../lib/configLogic";
import SettingsWindow from "./SettingsWindow";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  getSecret: vi.fn(),
  setSecret: vi.fn(),
  login: vi.fn(),
}));

vi.mock("../lib/tauriApi", () => ({
  tauriApi: {
    loadConfig: mocks.loadConfig,
    saveConfig: mocks.saveConfig,
    getSecret: mocks.getSecret,
    setSecret: mocks.setSecret,
  },
}));

vi.mock("../lib/octopHttp", () => ({
  login: mocks.login,
}));

describe("SettingsWindow", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockResolvedValue({
      ...DEFAULT_APP_CONFIG,
      baseUrl: "https://octop.example",
      username: "octopus",
      mascotId: "type",
    });
    mocks.getSecret.mockImplementation(async (key: string) =>
      key === "password" ? "secret-password" : null,
    );
    mocks.saveConfig.mockResolvedValue(undefined);
    mocks.setSecret.mockResolvedValue(undefined);
    mocks.login.mockResolvedValue({
      access_token: "hidden-access-token",
      expires_in: 3600,
    });
  });

  it("loads config and password without rendering an access token", async () => {
    render(<SettingsWindow />);

    expect(await screen.findByLabelText("服务地址")).toHaveValue(
      "https://octop.example",
    );
    expect(screen.getByLabelText("用户名")).toHaveValue("octopus");
    expect(screen.getByLabelText("密码")).toHaveValue("secret-password");
    expect(mocks.getSecret).toHaveBeenCalledWith("password");
    expect(screen.queryByText("hidden-access-token")).not.toBeInTheDocument();
  });

  it("normalizes and saves credentials while preserving other config", async () => {
    render(<SettingsWindow />);
    const baseUrl = await screen.findByLabelText("服务地址");

    fireEvent.change(baseUrl, {
      target: { value: " https://new.example/// " },
    });
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "new-user" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(mocks.saveConfig).toHaveBeenCalledWith({
        ...DEFAULT_APP_CONFIG,
        baseUrl: "https://new.example",
        username: "new-user",
        mascotId: "type",
      }),
    );
    expect(mocks.setSecret).toHaveBeenCalledWith("password", "new-password");
    expect(await screen.findByText("设置已保存")).toBeInTheDocument();
  });

  it("stores the token after a successful connection test and reports errors", async () => {
    render(<SettingsWindow />);
    await screen.findByDisplayValue("https://octop.example");

    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    await waitFor(() =>
      expect(mocks.login).toHaveBeenCalledWith(
        "https://octop.example",
        "octopus",
        "secret-password",
      ),
    );
    expect(mocks.setSecret).toHaveBeenCalledWith(
      "access_token",
      "hidden-access-token",
    );
    expect(await screen.findByText("连接成功")).toBeInTheDocument();
    expect(screen.queryByText("hidden-access-token")).not.toBeInTheDocument();

    mocks.login.mockRejectedValueOnce(new Error("用户名或密码错误"));
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    expect(
      await screen.findByText("连接失败：用户名或密码错误"),
    ).toBeInTheDocument();
  });
});
