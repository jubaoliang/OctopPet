// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "../lib/configLogic";
import { OctopHttpError } from "../lib/octopHttp";
import ChatWindow from "./ChatWindow";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  patchConfig: vi.fn(),
  getSecret: vi.fn(),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
  listenAuthUpdated: vi.fn(),
  showSettings: vi.fn(),
  listAgents: vi.fn(),
  createThread: vi.fn(),
  getHistory: vi.fn(),
  login: vi.fn(),
}));

vi.mock("../lib/tauriApi", () => ({
  tauriApi: {
    loadConfig: mocks.loadConfig,
    patchConfig: mocks.patchConfig,
    getSecret: mocks.getSecret,
    setSecret: mocks.setSecret,
    deleteSecret: mocks.deleteSecret,
    listenAuthUpdated: mocks.listenAuthUpdated,
    showSettings: mocks.showSettings,
  },
}));

vi.mock("../lib/octopHttp", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/octopHttp")>();
  return {
    ...original,
    listAgents: mocks.listAgents,
    createThread: mocks.createThread,
    getHistory: mocks.getHistory,
    login: mocks.login,
  };
});

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState: number = WebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.();
  }

  open() {
    this.readyState = WebSocket.OPEN;
    this.onopen?.();
  }

  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

describe("ChatWindow", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    mocks.loadConfig.mockResolvedValue({
      ...DEFAULT_APP_CONFIG,
      baseUrl: "https://octop.example",
      username: "juba",
      threadIdByAgent: {},
    });
    mocks.getSecret.mockImplementation(async (key: string) =>
      key === "access_token" ? "token-1" : null,
    );
    mocks.patchConfig.mockResolvedValue(undefined);
    mocks.setSecret.mockResolvedValue(undefined);
    mocks.deleteSecret.mockResolvedValue(undefined);
    mocks.listenAuthUpdated.mockResolvedValue(vi.fn());
    mocks.showSettings.mockResolvedValue(undefined);
    mocks.listAgents.mockResolvedValue([
      { id: "a1", name: "助手一", state: "online" },
      { id: "a2", name: "助手二", state: "offline" },
    ]);
    mocks.createThread.mockResolvedValue({
      thread_id: "new-thread",
      session_key: "session-1",
    });
    mocks.getHistory.mockResolvedValue({ messages: [] });
  });

  it("缺少访问令牌时提示并打开设置", async () => {
    mocks.getSecret.mockResolvedValue(null);

    render(<ChatWindow />);

    expect(await screen.findByText("需要先完成登录设置")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    expect(mocks.showSettings).toHaveBeenCalledOnce();
    expect(mocks.listAgents).not.toHaveBeenCalled();
  });

  it("设置更新事件到达后重新初始化聊天", async () => {
    let authUpdated: (() => void) | undefined;
    mocks.getSecret
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("token-after-settings");
    mocks.listenAuthUpdated.mockImplementation(async (handler: () => void) => {
      authUpdated = handler;
      return vi.fn();
    });

    render(<ChatWindow />);

    expect(await screen.findByText("需要先完成登录设置")).toBeInTheDocument();
    await waitFor(() => expect(authUpdated).toBeDefined());
    authUpdated?.();

    expect(
      await screen.findByRole("combobox", { name: "选择代理" }),
    ).toBeInTheDocument();
    expect(mocks.listAgents).toHaveBeenCalledWith(
      "https://octop.example",
      "token-after-settings",
    );
  });

  it("恢复历史并流式发送消息，停止时发送取消帧", async () => {
    mocks.loadConfig.mockResolvedValue({
      ...DEFAULT_APP_CONFIG,
      baseUrl: "https://octop.example",
      username: "juba",
      lastAgentId: "a1",
      threadIdByAgent: { a1: "thread-1" },
    });
    mocks.getHistory.mockResolvedValue({
      messages: [
        { role: "user", content: "之前的问题" },
        { role: "assistant", content: "**之前的回答**" },
        { role: "tool", content: "忽略我" },
      ],
    });

    render(<ChatWindow />);

    expect(await screen.findByText("之前的问题")).toBeInTheDocument();
    expect(screen.getByText("之前的回答")).toBeInTheDocument();
    expect(screen.queryByText("忽略我")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "你好" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toContain("/api/agents/a1/chat/ws?token=token-1");
    socket.open();
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: "user_turn",
      text: "你好",
      thread_id: "thread-1",
    });

    socket.message({ type: "token", content: "你" });
    socket.message({ type: "token", content: "好" });
    expect(await screen.findByText("你好", { selector: ".message-assistant p" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    expect(JSON.parse(socket.sent.at(-1) ?? "")).toEqual({
      type: "cancel",
      thread_id: "thread-1",
    });
  });

  it("切换代理时恢复映射线程，历史失效则新建并保存", async () => {
    mocks.loadConfig.mockResolvedValue({
      ...DEFAULT_APP_CONFIG,
      baseUrl: "https://octop.example",
      username: "juba",
      lastAgentId: "a1",
      threadIdByAgent: { a1: "thread-1", a2: "missing-thread" },
    });
    mocks.getHistory
      .mockResolvedValueOnce({ messages: [] })
      .mockRejectedValueOnce(new OctopHttpError(404, "missing"));
    mocks.createThread.mockResolvedValue({
      thread_id: "thread-2",
      session_key: "session-2",
    });

    render(<ChatWindow />);
    const select = await screen.findByRole("combobox", { name: "选择代理" });
    fireEvent.change(select, { target: { value: "a2" } });

    await waitFor(() =>
      expect(mocks.createThread).toHaveBeenCalledWith(
        "https://octop.example",
        "token-1",
        "a2",
      ),
    );
    expect(mocks.patchConfig).toHaveBeenCalledWith({
        lastAgentId: "a2",
        threadIdByAgent: { a1: "thread-1", a2: "thread-2" },
    });
  });

  it("代理请求遇到一次 401 时使用密码重新登录并重试", async () => {
    mocks.getSecret.mockImplementation(async (key: string) =>
      key === "access_token" ? "expired" : key === "password" ? "secret" : null,
    );
    mocks.listAgents
      .mockRejectedValueOnce(new OctopHttpError(401, "expired"))
      .mockResolvedValueOnce([{ id: "a1", name: "助手一", state: "online" }]);
    mocks.login.mockResolvedValue({ access_token: "fresh", expires_in: 3600 });

    render(<ChatWindow />);

    expect(await screen.findByRole("combobox", { name: "选择代理" })).toBeInTheDocument();
    expect(mocks.login).toHaveBeenCalledWith(
      "https://octop.example",
      "juba",
      "secret",
    );
    expect(mocks.deleteSecret).toHaveBeenCalledWith("access_token");
    expect(mocks.setSecret).toHaveBeenCalledWith("access_token", "fresh");
    expect(mocks.listAgents).toHaveBeenLastCalledWith(
      "https://octop.example",
      "fresh",
    );
  });

  it("401 静默登录失败时清除令牌并打开设置", async () => {
    mocks.getSecret.mockImplementation(async (key: string) =>
      key === "access_token" ? "expired" : key === "password" ? "secret" : null,
    );
    mocks.listAgents.mockRejectedValueOnce(new OctopHttpError(401, "expired"));
    mocks.login.mockRejectedValueOnce(new OctopHttpError(401, "bad credentials"));

    render(<ChatWindow />);

    expect(await screen.findByText("需要先完成登录设置")).toBeInTheDocument();
    expect(mocks.deleteSecret).toHaveBeenCalledWith("access_token");
    expect(mocks.login).toHaveBeenCalledOnce();
    expect(mocks.showSettings).toHaveBeenCalledOnce();
  });

  it("严格模式重复挂载时只采用当前初始化结果", async () => {
    render(
      <StrictMode>
        <ChatWindow />
      </StrictMode>,
    );

    expect(await screen.findByRole("combobox", { name: "选择代理" })).toBeInTheDocument();
    expect(mocks.listAgents).toHaveBeenCalledOnce();
  });
});
