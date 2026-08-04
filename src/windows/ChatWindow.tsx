import { useCallback, useEffect, useRef, useState } from "react";

import AgentSelect from "../components/AgentSelect";
import Composer from "../components/Composer";
import ConnectionBadge, {
  type ConnectionState,
} from "../components/ConnectionBadge";
import MessageList from "../components/MessageList";
import {
  applyStreamChunk,
  buildCancelPayload,
  buildChatWsUrl,
  buildUserTurnPayload,
} from "../lib/chatStream";
import {
  resolveThreadForAgent,
  withThreadForAgent,
} from "../lib/configLogic";
import {
  createThread,
  extractTextContent,
  getHistory,
  listAgents,
  login,
  OctopHttpError,
} from "../lib/octopHttp";
import { tauriApi } from "../lib/tauriApi";
import type { AgentSummary, AppConfig, ChatMessage } from "../lib/types";

interface ActiveThread {
  id: string;
  sessionKey?: string;
}

let nextMessageId = 0;

function messageId(prefix: string) {
  nextMessageId += 1;
  return `${prefix}-${nextMessageId}`;
}

function historyMessages(
  rows: Array<{ role: string; content: unknown }>,
): ChatMessage[] {
  return rows.flatMap((row) => {
    if (
      row.role !== "user" &&
      row.role !== "assistant" &&
      row.role !== "system"
    ) {
      return [];
    }
    const content = extractTextContent(row.content);
    if (!content) return [];
    return [{ id: messageId("history"), role: row.role, content }];
  });
}

function errorText(error: unknown): string {
  if (error instanceof OctopHttpError) {
    if (error.status === 401) return "登录已失效，请重新设置账号";
    return `服务请求失败（${error.status}）`;
  }
  return error instanceof Error ? error.message : "连接服务失败";
}

export default function ChatWindow() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentId, setAgentId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connection, setConnection] =
    useState<ConnectionState>("loading");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [needsSettings, setNeedsSettings] = useState(false);
  const [error, setError] = useState("");

  const configRef = useRef<AppConfig | null>(null);
  const tokenRef = useRef("");
  const threadRef = useRef<ActiveThread | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const assistantIdRef = useRef("");
  const streamFinishedRef = useRef(true);
  const loadSequenceRef = useRef(0);
  const mountedRef = useRef(true);

  const requireSettings = useCallback(async () => {
    tokenRef.current = "";
    setNeedsSettings(true);
    setConnection("disconnected");
    await tauriApi.showSettings().catch(() => undefined);
  }, []);

  const authorized = useCallback(
    async <T,>(operation: (token: string) => Promise<T>): Promise<T> => {
      try {
        return await operation(tokenRef.current);
      } catch (requestError) {
        if (!(requestError instanceof OctopHttpError) || requestError.status !== 401) {
          throw requestError;
        }

        tokenRef.current = "";
        await tauriApi.deleteSecret("access_token");
        const config = configRef.current;
        let freshToken: string;
        try {
          const password = await tauriApi.getSecret("password");
          if (!config || !password) throw requestError;

          const result = await login(config.baseUrl, config.username, password);
          await tauriApi.setSecret("access_token", result.access_token);
          freshToken = result.access_token;
          tokenRef.current = freshToken;
        } catch (loginError) {
          await requireSettings();
          throw loginError;
        }

        try {
          return await operation(freshToken);
        } catch (retryError) {
          if (
            retryError instanceof OctopHttpError &&
            retryError.status === 401
          ) {
            tokenRef.current = "";
            await tauriApi.deleteSecret("access_token");
            await requireSettings();
          }
          throw retryError;
        }
      }
    },
    [requireSettings],
  );

  const stopStream = useCallback(() => {
    const socket = socketRef.current;
    const thread = threadRef.current;
    streamFinishedRef.current = true;
    if (socket && socket.readyState === WebSocket.OPEN && thread) {
      socket.send(JSON.stringify(buildCancelPayload(thread.id)));
    }
    socket?.close();
    socketRef.current = null;
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantIdRef.current
          ? { ...message, pending: false }
          : message,
      ),
    );
    setConnection(thread ? "connected" : "disconnected");
  }, []);

  const openAgent = useCallback(
    async (nextAgentId: string) => {
      stopStream();
      const sequence = ++loadSequenceRef.current;
      const config = configRef.current;
      if (!config) return;

      setAgentId(nextAgentId);
      setMessages([]);
      setError("");
      setLoadingHistory(true);
      setConnection("loading");
      threadRef.current = null;

      try {
        let threadId = resolveThreadForAgent(config, nextAgentId);
        let sessionKey: string | undefined;
        let rows: Array<{ role: string; content: unknown }> = [];

        if (threadId) {
          try {
            const history = await authorized((token) =>
              getHistory(config.baseUrl, token, nextAgentId, threadId as string),
            );
            rows = history.messages;
          } catch (historyError) {
            if (
              !(historyError instanceof OctopHttpError) ||
              historyError.status !== 404
            ) {
              throw historyError;
            }
            threadId = null;
          }
        }

        if (!threadId) {
          const created = await authorized((token) =>
            createThread(config.baseUrl, token, nextAgentId),
          );
          threadId = created.thread_id;
          sessionKey = created.session_key;
        }

        const nextConfig = withThreadForAgent(config, nextAgentId, threadId);
        await tauriApi.patchConfig({
          lastAgentId: nextConfig.lastAgentId,
          threadIdByAgent: nextConfig.threadIdByAgent,
        });
        if (sequence !== loadSequenceRef.current || !mountedRef.current) return;

        configRef.current = nextConfig;
        threadRef.current = { id: threadId, sessionKey };
        setMessages(historyMessages(rows));
        setConnection("connected");
      } catch (loadError) {
        if (sequence !== loadSequenceRef.current || !mountedRef.current) return;
        setError(errorText(loadError));
        setConnection("disconnected");
      } finally {
        if (sequence === loadSequenceRef.current && mountedRef.current) {
          setLoadingHistory(false);
        }
      }
    },
    [authorized, stopStream],
  );

  const initialize = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setConnection("loading");
    setError("");
    try {
      const [config, token] = await Promise.all([
        tauriApi.loadConfig(),
        tauriApi.getSecret("access_token"),
      ]);
      if (sequence !== loadSequenceRef.current || !mountedRef.current) return;
      configRef.current = config;

      if (!token) {
        setNeedsSettings(true);
        setConnection("disconnected");
        return;
      }

      tokenRef.current = token;
      setNeedsSettings(false);
      const availableAgents = await authorized((activeToken) =>
        listAgents(config.baseUrl, activeToken),
      );
      if (sequence !== loadSequenceRef.current || !mountedRef.current) return;
      if (availableAgents.length === 0) {
        setError("没有可用代理");
        setConnection("disconnected");
        return;
      }

      setAgents(availableAgents);
      const selected =
        availableAgents.find((agent) => agent.id === config.lastAgentId) ??
        availableAgents[0];
      await openAgent(selected.id);
    } catch (initialError) {
      if (sequence !== loadSequenceRef.current || !mountedRef.current) return;
      setError(errorText(initialError));
      setConnection("disconnected");
    }
  }, [authorized, openAgent]);

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void initialize();
    void tauriApi
      .listenAuthUpdated(() => {
        if (!disposed && mountedRef.current) void initialize();
      })
      .then((registeredUnlisten) => {
        if (disposed) {
          registeredUnlisten();
        } else {
          unlisten = registeredUnlisten;
        }
      });

    return () => {
      disposed = true;
      mountedRef.current = false;
      loadSequenceRef.current += 1;
      streamFinishedRef.current = true;
      socketRef.current?.close();
      socketRef.current = null;
      unlisten?.();
    };
  }, [initialize]);

  const sendMessage = useCallback((text: string) => {
    const config = configRef.current;
    const thread = threadRef.current;
    const currentAgentId = agentId;
    if (!config || !thread || !currentAgentId || socketRef.current) return;

    const userId = messageId("user");
    const assistantId = messageId("assistant");
    assistantIdRef.current = assistantId;
    streamFinishedRef.current = false;
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", content: text },
      { id: assistantId, role: "assistant", content: "", pending: true },
    ]);
    setConnection("streaming");
    setError("");

    const socket = new WebSocket(
      buildChatWsUrl(config.baseUrl, currentAgentId, tokenRef.current),
    );
    socketRef.current = socket;
    let assistantText = "";

    const finish = (streamError?: string) => {
      if (streamFinishedRef.current) return;
      streamFinishedRef.current = true;
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: assistantText,
                pending: false,
                error: streamError,
              }
            : message,
        ),
      );
      setConnection(streamError ? "disconnected" : "connected");
      socketRef.current = null;
      socket.close();
    };

    socket.onopen = () => {
      socket.send(
        JSON.stringify(
          buildUserTurnPayload({
            text,
            threadId: thread.id,
            sessionKey: thread.sessionKey,
          }),
        ),
      );
    };
    socket.onmessage = (event) => {
      try {
        const result = applyStreamChunk(assistantText, JSON.parse(event.data));
        assistantText = result.text;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, content: assistantText }
              : message,
          ),
        );
        if (result.done) finish(result.error);
      } catch {
        finish("收到无效的流式响应");
      }
    };
    socket.onerror = () => finish("流式连接失败");
    socket.onclose = () => {
      if (!streamFinishedRef.current) finish("连接意外断开");
    };
  }, [agentId]);

  if (needsSettings) {
    return (
      <main className="chat-window chat-gate">
        <p>需要先完成登录设置</p>
        <button type="button" onClick={() => void tauriApi.showSettings()}>
          打开设置
        </button>
      </main>
    );
  }

  return (
    <main className="chat-window">
      <header className="chat-toolbar">
        <AgentSelect
          agents={agents}
          value={agentId}
          disabled={loadingHistory || connection === "streaming"}
          onChange={(id) => void openAgent(id)}
        />
        <ConnectionBadge state={connection} />
      </header>
      {error ? <p className="chat-error" role="alert">{error}</p> : null}
      <MessageList messages={messages} loading={loadingHistory} />
      <Composer
        disabled={!threadRef.current || loadingHistory}
        streaming={connection === "streaming"}
        onSend={sendMessage}
        onStop={stopStream}
      />
    </main>
  );
}
