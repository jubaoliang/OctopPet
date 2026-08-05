import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ComposerSendOptions } from "../components/Composer";
import {
  applyStreamChunk,
  buildCancelPayload,
  buildChatWsUrl,
  buildUserTurnPayload,
} from "../lib/chatStream";
import {
  CHAT_COMPACT_MIN_HEIGHT,
  CHAT_EXPANDED_HEIGHT,
  CHAT_MIN_HEIGHT,
  CHAT_MIN_WIDTH,
  CHAT_WIDTH,
  chatErrorText,
  historyMessages,
  nextChatMessageId,
} from "../lib/chatHelpers";
import { resolveThreadForAgent, withThreadForAgent } from "../lib/configLogic";
import {
  enqueueChatItem,
  shiftChatItem,
  type QueuedChatItem,
} from "../lib/messageQueue";
import {
  createThread,
  getHistory,
  listAgents,
  listConnectors,
  listResolvedModels,
  login,
  OctopHttpError,
  uploadAttachment,
} from "../lib/octopHttp";
import type {
  ChatAttachment,
  ConnectorOption,
  ResolvedModel,
} from "../lib/octopTypes";
import {
  applyStreamStatusEvent,
  beginStreamStatus,
  formatStreamStatusLabel,
  idleStreamStatus,
  type StreamStatusState,
} from "../lib/streamStatus";
import { tauriApi } from "../lib/tauriApi";
import {
  applyBottomAnchoredSize,
  clearCurrentWindowMaxSize,
  setCurrentWindowMinSize,
  setCurrentWindowResizable,
} from "../lib/tauriWindowApi";
import type { AgentSummary, AppConfig, ChatMessage } from "../lib/types";

interface ActiveThread {
  id: string;
  sessionKey?: string;
}

export function useChatController() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentId, setAgentId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connection, setConnection] = useState<
    "loading" | "connected" | "disconnected" | "streaming"
  >("loading");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [needsSettings, setNeedsSettings] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLElement | null>(null);
  const wasExpandedRef = useRef(false);
  const lastCompactHeightRef = useRef(0);

  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [models, setModels] = useState<ResolvedModel[]>([]);
  const [connectors, setConnectors] = useState<ConnectorOption[]>([]);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [queue, setQueue] = useState<QueuedChatItem[]>([]);
  const [streamStatus, setStreamStatus] =
    useState<StreamStatusState>(idleStreamStatus);
  const [statusNow, setStatusNow] = useState(() => Date.now());
  const turnOptionsRef = useRef<ComposerSendOptions>({
    attachments: [],
    model: null,
    mcpServers: [],
  });
  const queueRef = useRef<QueuedChatItem[]>([]);
  queueRef.current = queue;
  const flushAfterStreamRef = useRef(false);

  const configRef = useRef<AppConfig | null>(null);
  const tokenRef = useRef("");
  const threadRef = useRef<ActiveThread | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const assistantIdRef = useRef("");
  const streamFinishedRef = useRef(true);
  const loadSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  const needsSettingsRef = useRef(needsSettings);
  needsSettingsRef.current = needsSettings;
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const expanded = messages.length > 0 || loadingHistory || queue.length > 0;

  const requireSettings = useCallback(async () => {
    tokenRef.current = "";
    setNeedsSettings(true);
    setConnection("disconnected");
    await tauriApi.showSettings().catch(() => undefined);
  }, []);

  const authorized = useCallback(
    async <T>(operation: (token: string) => Promise<T>): Promise<T> => {
      try {
        return await operation(tokenRef.current);
      } catch (requestError) {
        if (
          !(requestError instanceof OctopHttpError) ||
          requestError.status !== 401
        ) {
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
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
    setStreamStatus(idleStreamStatus());
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
      setAttachments([]);
      setQueue([]);
      setStreamStatus(idleStreamStatus());
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
              getHistory(
                config.baseUrl,
                token,
                nextAgentId,
                threadId as string,
              ),
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
        setError(chatErrorText(loadError));
        setConnection("disconnected");
      } finally {
        if (sequence === loadSequenceRef.current && mountedRef.current) {
          setLoadingHistory(false);
        }
      }
    },
    [authorized, stopStream],
  );

  const startNewSession = useCallback(async () => {
    const config = configRef.current;
    const currentAgentId = agentId;
    if (!config || !currentAgentId) return;

    stopStream();
    const sequence = ++loadSequenceRef.current;
    setMessages([]);
    setAttachments([]);
    setQueue([]);
    setStreamStatus(idleStreamStatus());
    setError("");
    setLoadingHistory(true);
    setConnection("loading");
    threadRef.current = null;

    try {
      const created = await authorized((token) =>
        createThread(config.baseUrl, token, currentAgentId),
      );
      const nextConfig = withThreadForAgent(
        config,
        currentAgentId,
        created.thread_id,
      );
      await tauriApi.patchConfig({
        lastAgentId: nextConfig.lastAgentId,
        threadIdByAgent: nextConfig.threadIdByAgent,
      });
      if (sequence !== loadSequenceRef.current || !mountedRef.current) return;
      configRef.current = nextConfig;
      threadRef.current = {
        id: created.thread_id,
        sessionKey: created.session_key,
      };
      setConnection("connected");
    } catch (createError) {
      if (sequence !== loadSequenceRef.current || !mountedRef.current) return;
      setError(chatErrorText(createError));
      setConnection("disconnected");
    } finally {
      if (sequence === loadSequenceRef.current && mountedRef.current) {
        setLoadingHistory(false);
      }
    }
  }, [agentId, authorized, stopStream]);

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
      const [availableModels, availableConnectors] = await Promise.all([
        authorized((activeToken) =>
          listResolvedModels(config.baseUrl, activeToken),
        ).catch(() => [] as ResolvedModel[]),
        authorized((activeToken) =>
          listConnectors(config.baseUrl, activeToken),
        ).catch(() => [] as ConnectorOption[]),
      ]);
      if (sequence !== loadSequenceRef.current || !mountedRef.current) return;
      setModels(availableModels);
      setConnectors(availableConnectors);

      const selected =
        availableAgents.find((agent) => agent.id === config.lastAgentId) ??
        availableAgents[0];
      await openAgent(selected.id);
    } catch (initialError) {
      if (sequence !== loadSequenceRef.current || !mountedRef.current) return;
      setError(chatErrorText(initialError));
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
        if (disposed) registeredUnlisten();
        else unlisten = registeredUnlisten;
      });

    let unlistenChatShown: (() => void) | undefined;
    void tauriApi
      .listenChatShown(() => {
        if (
          disposed ||
          !mountedRef.current ||
          needsSettingsRef.current ||
          connectionRef.current !== "disconnected"
        ) {
          return;
        }
        void initialize();
      })
      .then((registeredUnlisten) => {
        if (disposed) registeredUnlisten();
        else unlistenChatShown = registeredUnlisten;
      });

    return () => {
      disposed = true;
      mountedRef.current = false;
      loadSequenceRef.current += 1;
      streamFinishedRef.current = true;
      socketRef.current?.close();
      socketRef.current = null;
      unlisten?.();
      unlistenChatShown?.();
    };
  }, [initialize]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
  }, []);

  const speakMessage = useCallback(
    (messageIdValue: string, text: string) => {
      if (!text.trim() || !window.speechSynthesis) return;
      if (speakingId === messageIdValue) {
        stopSpeaking();
        return;
      }
      stopSpeaking();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = /[\u4e00-\u9fff]/.test(text) ? "zh-CN" : "en-US";
      utterance.onend = () => {
        setSpeakingId((current) =>
          current === messageIdValue ? null : current,
        );
      };
      utterance.onerror = () => {
        setSpeakingId((current) =>
          current === messageIdValue ? null : current,
        );
      };
      setSpeakingId(messageIdValue);
      window.speechSynthesis.speak(utterance);
    },
    [speakingId, stopSpeaking],
  );

  const startAssistantStream = useCallback(
    (text: string, assistantId: string, options?: ComposerSendOptions) => {
      const config = configRef.current;
      const thread = threadRef.current;
      const currentAgentId = agentId;
      if (!config || !thread || !currentAgentId || socketRef.current) return;

      const turnOptions = options ?? turnOptionsRef.current;
      turnOptionsRef.current = turnOptions;

      stopSpeaking();
      assistantIdRef.current = assistantId;
      streamFinishedRef.current = false;
      flushAfterStreamRef.current = true;
      setConnection("streaming");
      setStreamStatus(beginStreamStatus());
      setError("");

      const socket = new WebSocket(
        buildChatWsUrl(config.baseUrl, currentAgentId, tokenRef.current),
      );
      socketRef.current = socket;
      let assistantText = "";
      let status = beginStreamStatus();

      const finish = (streamError?: string) => {
        if (streamFinishedRef.current) return;
        streamFinishedRef.current = true;
        setStreamStatus(idleStreamStatus());
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
              attachments: turnOptions.attachments,
              model: turnOptions.model,
              mcpServers: turnOptions.mcpServers,
            }),
          ),
        );
      };
      socket.onmessage = (event) => {
        try {
          const chunk = JSON.parse(event.data);
          status = applyStreamStatusEvent(status, chunk);
          setStreamStatus(status);
          const result = applyStreamChunk(assistantText, chunk);
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
    },
    [agentId, stopSpeaking],
  );

  const sendMessage = useCallback(
    (text: string, options: ComposerSendOptions) => {
      if (socketRef.current) return;
      const displayText =
        text ||
        (options.attachments.length
          ? `[附件] ${options.attachments.map((item) => item.filename).join(", ")}`
          : "");
      const userId = nextChatMessageId("user");
      const assistantId = nextChatMessageId("assistant");
      setMessages((current) => [
        ...current,
        { id: userId, role: "user", content: displayText },
        { id: assistantId, role: "assistant", content: "", pending: true },
      ]);
      startAssistantStream(text, assistantId, options);
    },
    [startAssistantStream],
  );

  const queueMessage = useCallback(
    (text: string, options: ComposerSendOptions): "ok" | "full" => {
      const result = enqueueChatItem(queueRef.current, {
        id: nextChatMessageId("queue"),
        text,
        attachments: options.attachments,
        model: options.model,
        mcpServers: options.mcpServers,
        createdAt: Date.now(),
      });
      setQueue(result.queue);
      if (!result.ok) {
        setError(`排队已满（最多 ${result.queue.length} 条）`);
        return "full";
      }
      setError("");
      return "ok";
    },
    [],
  );

  const uploadFiles = useCallback(
    async (files: FileList) => {
      const config = configRef.current;
      const currentAgentId = agentId;
      if (!config || !currentAgentId || files.length === 0) return;

      setUploading(true);
      setError("");
      try {
        const uploaded: ChatAttachment[] = [];
        for (const file of Array.from(files)) {
          const attachment = await authorized((token) =>
            uploadAttachment(config.baseUrl, token, currentAgentId, file),
          );
          if (attachment.workspacePath) uploaded.push(attachment);
        }
        if (uploaded.length) {
          setAttachments((current) => [...current, ...uploaded]);
        }
      } catch (uploadError) {
        setError(chatErrorText(uploadError));
      } finally {
        setUploading(false);
      }
    },
    [agentId, authorized],
  );

  const retryAssistant = useCallback(
    (assistantMessageId: string) => {
      if (socketRef.current || connection === "streaming") return;
      const current = messagesRef.current;
      const index = current.findIndex(
        (message) => message.id === assistantMessageId,
      );
      if (index < 0) return;

      let prompt = "";
      for (let i = index - 1; i >= 0; i -= 1) {
        if (current[i].role === "user" && current[i].content.trim()) {
          prompt = current[i].content;
          break;
        }
      }
      if (!prompt) return;

      const nextAssistantId = nextChatMessageId("assistant");
      setMessages([
        ...current.slice(0, index),
        {
          id: nextAssistantId,
          role: "assistant",
          content: "",
          pending: true,
        },
      ]);
      startAssistantStream(prompt, nextAssistantId);
    },
    [connection, startAssistantStream],
  );

  useEffect(() => {
    if (connection === "streaming") {
      const timer = window.setInterval(() => setStatusNow(Date.now()), 1000);
      return () => window.clearInterval(timer);
    }
    setStatusNow(Date.now());
  }, [connection]);

  useEffect(() => {
    if (connection === "streaming" || !flushAfterStreamRef.current) return;
    if (queueRef.current.length === 0) {
      flushAfterStreamRef.current = false;
      return;
    }
    const { item, queue: rest } = shiftChatItem(queueRef.current);
    if (!item) {
      flushAfterStreamRef.current = false;
      return;
    }
    flushAfterStreamRef.current = false;
    setQueue(rest);
    sendMessage(item.text, {
      attachments: item.attachments,
      model: item.model,
      mcpServers: item.mcpServers,
    });
  }, [connection, sendMessage]);

  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  const fitCompactWindow = useCallback(() => {
    const root = rootRef.current;
    if (!root || expanded || needsSettings) return;
    const height = Math.max(
      CHAT_COMPACT_MIN_HEIGHT,
      Math.ceil(root.getBoundingClientRect().height),
    );
    if (height === lastCompactHeightRef.current) return;
    lastCompactHeightRef.current = height;
    void applyBottomAnchoredSize({ width: CHAT_WIDTH, height });
  }, [expanded, needsSettings]);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("chat-expanded", expanded);
    void setCurrentWindowResizable(expanded);
    void clearCurrentWindowMaxSize();
    void setCurrentWindowMinSize(
      CHAT_MIN_WIDTH,
      expanded ? CHAT_MIN_HEIGHT : CHAT_COMPACT_MIN_HEIGHT,
    );

    if (expanded || needsSettings) {
      if (!wasExpandedRef.current) {
        wasExpandedRef.current = true;
        void applyBottomAnchoredSize({
          width: CHAT_WIDTH,
          height: CHAT_EXPANDED_HEIGHT,
        });
      }
    } else if (wasExpandedRef.current) {
      wasExpandedRef.current = false;
      lastCompactHeightRef.current = 0;
      requestAnimationFrame(() => fitCompactWindow());
    } else {
      requestAnimationFrame(() => fitCompactWindow());
    }

    return () => {
      document.documentElement.classList.remove("chat-expanded");
    };
  }, [expanded, needsSettings, fitCompactWindow]);

  const statusLabel =
    connection === "streaming"
      ? formatStreamStatusLabel(streamStatus, statusNow)
      : null;

  return {
    rootRef,
    needsSettings,
    expanded,
    error,
    agents,
    agentId,
    messages,
    connection,
    loadingHistory,
    speakingId,
    models,
    connectors,
    attachments,
    uploading,
    queue,
    statusLabel,
    threadReady: Boolean(threadRef.current),
    openAgent,
    startNewSession,
    stopStream,
    sendMessage,
    queueMessage,
    uploadFiles,
    retryAssistant,
    speakMessage,
    setAttachments,
    setQueue,
    fitCompactWindow,
  };
}
