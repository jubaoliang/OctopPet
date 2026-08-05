import { Link2, Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import AgentSelect from "./AgentSelect";
import type { AgentSummary } from "../lib/types";
import type {
  ChatAttachment,
  ConnectorOption,
  ResolvedModel,
} from "../lib/octopTypes";
import { modelOptionLabel, modelOptionValue } from "../lib/octopTypes";

export type ComposerSendOptions = {
  attachments: ChatAttachment[];
  model: string | null;
  mcpServers: string[];
};

interface ComposerProps {
  agents: AgentSummary[];
  agentId: string;
  onAgentChange: (agentId: string) => void;
  models?: ResolvedModel[];
  connectors?: ConnectorOption[];
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void;
  disabled?: boolean;
  streaming?: boolean;
  agentDisabled?: boolean;
  uploading?: boolean;
  onUploadFiles?: (files: FileList) => void;
  onSend: (text: string, options: ComposerSendOptions) => void;
  onQueue?: (text: string, options: ComposerSendOptions) => "ok" | "full";
  onStop: () => void;
  /** Fired after the composer intrinsic height may have changed. */
  onLayoutChange?: () => void;
}

const TEXTAREA_MAX_PX = 128; // ~8rem

export default function Composer({
  agents,
  agentId,
  onAgentChange,
  models = [],
  connectors = [],
  attachments = [],
  onAttachmentsChange,
  disabled = false,
  streaming = false,
  agentDisabled = false,
  uploading = false,
  onUploadFiles,
  onSend,
  onQueue,
  onStop,
  onLayoutChange,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const [connectorOpen, setConnectorOpen] = useState(false);
  const composingRef = useRef(false);
  const ignoreEnterUntilRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const connectorMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLFormElement>(null);

  const hasContent = text.trim().length > 0 || attachments.length > 0;
  const canQueue =
    streaming && Boolean(onQueue) && !disabled && !uploading && hasContent;
  const canSend = !disabled && !streaming && !uploading && hasContent;

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node;
      if (modelMenuRef.current && !modelMenuRef.current.contains(target)) {
        setModelOpen(false);
      }
      if (
        connectorMenuRef.current &&
        !connectorMenuRef.current.contains(target)
      ) {
        setConnectorOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const next = Math.min(textarea.scrollHeight, TEXTAREA_MAX_PX);
      textarea.style.height = `${next}px`;
    }
    onLayoutChange?.();
  }, [text, attachments.length, onLayoutChange]);

  function submitDraft() {
    if (streaming) {
      if (!canQueue || !onQueue) return;
      const value = text.trim();
      const result = onQueue(value, {
        attachments,
        model: selectedModel || null,
        mcpServers: selectedConnectors,
      });
      if (result === "ok") {
        setText("");
        onAttachmentsChange?.([]);
      }
      return;
    }
    if (!canSend) return;
    const value = text.trim();
    onSend(value, {
      attachments,
      model: selectedModel || null,
      mcpServers: selectedConnectors,
    });
    setText("");
    onAttachmentsChange?.([]);
  }

  const selectedModelRow = models.find(
    (model) => modelOptionValue(model) === selectedModel,
  );
  const selectedModelLabel = selectedModelRow
    ? modelOptionLabel(selectedModelRow)
    : "自动";

  const submitMode = streaming ? (hasContent ? "queue" : "stop") : "send";

  return (
    <form
      ref={rootRef}
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (submitMode === "stop") {
          onStop();
          return;
        }
        submitDraft();
      }}
    >
      {attachments.length > 0 ? (
        <div className="composer-attachments" aria-label="待发送附件">
          {attachments.map((attachment) => (
            <span key={attachment.workspacePath} className="composer-chip">
              <span className="composer-chip-label">{attachment.filename}</span>
              <button
                type="button"
                className="composer-chip-remove"
                aria-label={`移除 ${attachment.filename}`}
                onClick={() =>
                  onAttachmentsChange?.(
                    attachments.filter(
                      (item) => item.workspacePath !== attachment.workspacePath,
                    ),
                  )
                }
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <textarea
        ref={textareaRef}
        aria-label="消息"
        rows={1}
        value={text}
        disabled={disabled}
        placeholder={disabled ? "连接后即可发送" : "和 Octop 说点什么"}
        onChange={(event) => setText(event.currentTarget.value)}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          // Some engines fire a confirmatory Enter keydown after compositionend.
          ignoreEnterUntilRef.current = Date.now() + 150;
        }}
        onKeyDown={(event) => {
          // IME (e.g. Chinese Pinyin): Enter confirms composition — do not send.
          if (
            event.nativeEvent.isComposing ||
            composingRef.current ||
            event.keyCode === 229
          ) {
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            if (Date.now() < ignoreEnterUntilRef.current) {
              event.preventDefault();
              return;
            }
            event.preventDefault();
            if (submitMode === "stop") return;
            submitDraft();
          }
        }}
      />

      <div className="composer-toolbar">
        <div className="composer-toolbar-left">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              if (event.currentTarget.files && onUploadFiles) {
                onUploadFiles(event.currentTarget.files);
              }
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            className="composer-icon-btn"
            aria-label="添加附件"
            title="添加附件"
            disabled={disabled || uploading || !onUploadFiles}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={16} strokeWidth={1.75} />
          </button>

          <AgentSelect
            agents={agents}
            value={agentId}
            disabled={agentDisabled || streaming}
            onChange={onAgentChange}
          />

          <div className="composer-menu" ref={connectorMenuRef}>
            <button
              type="button"
              className={`composer-chip-btn${selectedConnectors.length ? " is-active" : ""}`}
              aria-label="连接器"
              title="连接器"
              disabled={disabled || connectors.length === 0}
              onClick={() => {
                setConnectorOpen((open) => !open);
                setModelOpen(false);
              }}
            >
              <Link2 size={14} strokeWidth={1.75} />
              <span>
                {selectedConnectors.length
                  ? `连接器 ${selectedConnectors.length}`
                  : "连接器"}
              </span>
            </button>
            {connectorOpen ? (
              <div className="composer-popover" role="menu">
                {connectors.map((connector) => {
                  const active = selectedConnectors.includes(
                    connector.mcp_server_name,
                  );
                  return (
                    <button
                      key={connector.mcp_server_name}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={active}
                      className={`composer-popover-item${active ? " is-selected" : ""}`}
                      onClick={() => {
                        setSelectedConnectors((current) =>
                          active
                            ? current.filter(
                                (name) => name !== connector.mcp_server_name,
                              )
                            : [...current, connector.mcp_server_name],
                        );
                      }}
                    >
                      {connector.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="composer-menu" ref={modelMenuRef}>
            <button
              type="button"
              className="composer-chip-btn"
              aria-label="选择模型"
              title="选择模型"
              disabled={disabled}
              onClick={() => {
                setModelOpen((open) => !open);
                setConnectorOpen(false);
              }}
            >
              <span className="composer-model-label">{selectedModelLabel}</span>
            </button>
            {modelOpen ? (
              <div
                className="composer-popover composer-popover-model"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={!selectedModel}
                  className={`composer-popover-item${!selectedModel ? " is-selected" : ""}`}
                  onClick={() => {
                    setSelectedModel("");
                    setModelOpen(false);
                  }}
                >
                  自动
                </button>
                {models.map((model) => {
                  const value = modelOptionValue(model);
                  return (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selectedModel === value}
                      className={`composer-popover-item${selectedModel === value ? " is-selected" : ""}`}
                      onClick={() => {
                        setSelectedModel(value);
                        setModelOpen(false);
                      }}
                    >
                      {modelOptionLabel(model)}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="composer-toolbar-right">
          <button
            className={`composer-send${submitMode === "stop" ? " is-stop" : ""}${submitMode === "queue" ? " is-queue" : ""}`}
            type="submit"
            disabled={
              submitMode === "stop"
                ? false
                : submitMode === "queue"
                  ? !canQueue
                  : !canSend
            }
            aria-label={
              submitMode === "stop"
                ? "停止生成"
                : submitMode === "queue"
                  ? "加入队列"
                  : "发送"
            }
            title={
              submitMode === "stop"
                ? "停止"
                : submitMode === "queue"
                  ? "排队"
                  : "发送"
            }
          >
            {submitMode === "stop" ? (
              <span className="composer-send-stop" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 19V5M12 5l-6 6M12 5l6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
