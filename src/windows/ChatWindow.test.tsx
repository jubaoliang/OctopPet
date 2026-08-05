// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  listenChatShown: vi.fn(),
  showSettings: vi.fn(),
  placeWindowBottomCenter: vi.fn(),
  listAgents: vi.fn(),
  createThread: vi.fn(),
  getHistory: vi.fn(),
  login: vi.fn(),
  listResolvedModels: vi.fn(),
  listConnectors: vi.fn(),
  uploadAttachment: vi.fn(),
  setMinSize: vi.fn(),
  applyBottomAnchoredSize: vi.fn(),
  hideCurrentWindow: vi.fn(),
}));

vi.mock("../lib/tauriWindowApi", () => ({
  hideCurrentWindow: mocks.hideCurrentWindow.mockResolvedValue(undefined),
  applyBottomAnchoredSize:
    mocks.applyBottomAnchoredSize.mockResolvedValue(undefined),
  setCurrentWindowResizable: vi.fn().mockResolvedValue(undefined),
  clearCurrentWindowMaxSize: vi.fn().mockResolvedValue(undefined),
  setCurrentWindowMinSize: mocks.setMinSize.mockResolvedValue(undefined),
  startCurrentWindowResize: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/tauriApi", () => ({
  tauriApi: {
    loadConfig: mocks.loadConfig,
    patchConfig: mocks.patchConfig,
    getSecret: mocks.getSecret,
    setSecret: mocks.setSecret,
    deleteSecret: mocks.deleteSecret,
    listenAuthUpdated: mocks.listenAuthUpdated,
    listenChatShown: mocks.listenChatShown,
    showSettings: mocks.showSettings,
    placeWindowBottomCenter: mocks.placeWindowBottomCenter,
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
    listResolvedModels: mocks.listResolvedModels,
    listConnectors: mocks.listConnectors,
    uploadAttachment: mocks.uploadAttachment,
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
    mocks.listenChatShown.mockResolvedValue(vi.fn());
    mocks.showSettings.mockResolvedValue(undefined);
    mocks.placeWindowBottomCenter.mockResolvedValue(undefined);
    mocks.listAgents.mockResolvedValue([
      { id: "a1", name: "助手一", state: "online" },
      { id: "a2", name: "助手二", state: "offline" },
    ]);
    mocks.createThread.mockResolvedValue({
      thread_id: "new-thread",
      session_key: "session-1",
    });
    mocks.getHistory.mockResolvedValue({ messages: [] });
    mocks.listResolvedModels.mockResolvedValue([
      { provider_name: "openai", model: "gpt-4o", name: "GPT-4o" },
    ]);
    mocks.listConnectors.mockResolvedValue([
      { mcp_server_name: "github", label: "GitHub", kind: "oauth" },
    ]);
    mocks.applyBottomAnchoredSize.mockResolvedValue(undefined);
    mocks.setMinSize.mockResolvedValue(undefined);
    mocks.uploadAttachment.mockResolvedValue({
      filename: "a.png",
      mediaType: "image/png",
      workspacePath: "inbound/a.png",
      url: "https://octop.example/inbound/a.png",
    });
  });

  it("紧凑窗口贴合内容高度，不留出画阴影的空白", async () => {
    const contentHeight = 155;
    const rect = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({
        width: 400,
        height: contentHeight,
        top: 0,
        left: 0,
        right: 400,
        bottom: contentHeight,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

    render(<ChatWindow />);

    await waitFor(() =>
      expect(mocks.applyBottomAnchoredSize).toHaveBeenCalled(),
    );
    expect(mocks.applyBottomAnchoredSize).toHaveBeenCalledWith({
      width: 400,
      height: contentHeight,
    });

    const minHeight = mocks.setMinSize.mock.calls.at(-1)?.[1] as number;
    expect(minHeight).toBeLessThanOrEqual(contentHeight);

    rect.mockRestore();
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

  it("连接失败后再次打开聊天窗口会重新初始化", async () => {
    let chatShown: (() => void) | undefined;
    mocks.listAgents
      .mockRejectedValueOnce(
        new Error(
          "error sending request for url (http://localhost:8088/api/agents)",
        ),
      )
      .mockResolvedValueOnce([{ id: "a1", name: "助手一", state: "online" }]);
    mocks.listenChatShown.mockImplementation(async (handler: () => void) => {
      chatShown = handler;
      return vi.fn();
    });

    render(<ChatWindow />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /error sending request|无法连接服务/,
    );
    await waitFor(() => expect(chatShown).toBeDefined());
    chatShown?.();

    expect(
      await screen.findByRole("combobox", { name: "选择代理" }),
    ).toBeInTheDocument();
    expect(mocks.listAgents).toHaveBeenCalledTimes(2);
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
    expect(screen.getByText("之前的回答").closest("strong")).toBeTruthy();
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
    expect(
      await screen.findByText("你好", { selector: ".message-assistant p" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
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

    expect(
      await screen.findByRole("combobox", { name: "选择代理" }),
    ).toBeInTheDocument();
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
    mocks.login.mockRejectedValueOnce(
      new OctopHttpError(401, "bad credentials"),
    );

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

    expect(
      await screen.findByRole("combobox", { name: "选择代理" }),
    ).toBeInTheDocument();
    expect(mocks.listAgents).toHaveBeenCalledOnce();
  });

  it("无历史时不显示空状态文案，新建会话会创建新 thread", async () => {
    mocks.loadConfig.mockResolvedValue({
      ...DEFAULT_APP_CONFIG,
      baseUrl: "https://octop.example",
      username: "juba",
      lastAgentId: "a1",
      threadIdByAgent: { a1: "thread-1" },
    });
    mocks.getHistory.mockResolvedValue({ messages: [] });
    mocks.createThread.mockResolvedValue({
      thread_id: "thread-fresh",
      session_key: "session-fresh",
    });

    render(<ChatWindow />);

    expect(
      await screen.findByRole("combobox", { name: "选择代理" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("开始和代理聊聊吧")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "聊天消息" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新建会话" }));

    await waitFor(() =>
      expect(mocks.createThread).toHaveBeenCalledWith(
        "https://octop.example",
        "token-1",
        "a1",
      ),
    );
    expect(mocks.patchConfig).toHaveBeenCalledWith({
      lastAgentId: "a1",
      threadIdByAgent: { a1: "thread-fresh" },
    });
  });

  it("助手消息提供复制/重试/语音，重试会重新发起流式请求", async () => {
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
        { role: "assistant", content: "之前的回答" },
      ],
    });
    const speak = vi.fn();
    vi.stubGlobal("speechSynthesis", {
      speak,
      cancel: vi.fn(),
    });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string;
        lang = "";
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      },
    );

    render(<ChatWindow />);
    expect(await screen.findByText("之前的回答")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "语音" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "语音" }));
    expect(speak).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));
    const socket = FakeWebSocket.instances[0];
    socket.open();
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: "user_turn",
      text: "之前的问题",
      thread_id: "thread-1",
    });
  });

  it("发送时可选择模型与连接器，并上传附件", async () => {
    mocks.loadConfig.mockResolvedValue({
      ...DEFAULT_APP_CONFIG,
      baseUrl: "https://octop.example",
      username: "juba",
      lastAgentId: "a1",
      threadIdByAgent: { a1: "thread-1" },
    });

    render(<ChatWindow />);
    expect(
      await screen.findByRole("button", { name: "添加附件" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "选择模型" }));
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "openai / GPT-4o" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "连接器" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "GitHub" }));

    const file = new File(["x"], "a.png", { type: "image/png" });
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() =>
      expect(mocks.uploadAttachment).toHaveBeenCalledWith(
        "https://octop.example",
        "token-1",
        "a1",
        file,
      ),
    );
    expect(await screen.findByText("a.png")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "看图" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    const socket = FakeWebSocket.instances[0];
    socket.open();
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: "user_turn",
      text: "看图",
      thread_id: "thread-1",
      model: "openai/gpt-4o",
      mcp_servers: ["github"],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "看图" },
            {
              type: "image_url",
              image_url: { url: "https://octop.example/inbound/a.png" },
            },
          ],
        },
      ],
    });
  });

  it("流式期间可继续输入并排队，状态提示会随工具事件切换", async () => {
    mocks.loadConfig.mockResolvedValue({
      ...DEFAULT_APP_CONFIG,
      baseUrl: "https://octop.example",
      username: "juba",
      lastAgentId: "a1",
      threadIdByAgent: { a1: "thread-1" },
    });

    render(<ChatWindow />);
    expect(
      await screen.findByRole("combobox", { name: "选择代理" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "第一句" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    const socket = FakeWebSocket.instances[0];
    socket.open();
    expect(await screen.findByText(/生成中/)).toBeInTheDocument();

    socket.message({ type: "tool_call_chunk", name: "web_search" });
    expect(await screen.findByText("正在调用：web_search")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "排队的第二句" },
    });
    fireEvent.click(screen.getByRole("button", { name: "加入队列" }));
    expect(await screen.findByText("排队的第二句")).toBeInTheDocument();

    socket.message({ type: "token", content: "答" });
    socket.message({ type: "done" });

    await waitFor(() => expect(FakeWebSocket.instances.length).toBe(2));
    const next = FakeWebSocket.instances[1];
    next.open();
    expect(JSON.parse(next.sent[0])).toMatchObject({
      type: "user_turn",
      text: "排队的第二句",
      thread_id: "thread-1",
    });
  });
});
