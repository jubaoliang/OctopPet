import type { AppConfig, MascotId } from "./types";

export const DEFAULT_APP_CONFIG: AppConfig = {
  baseUrl: "",
  username: "",
  mascotId: "peek",
  lastAgentId: null,
  threadIdByAgent: {},
  petX: null,
  petY: null,
};

export const MASCOT_SRC: Record<MascotId, string> = {
  peek: "/mascots/peek.webp",
  type: "/mascots/type.webp",
};

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("服务地址不能为空");
  return trimmed;
}

export function resolveThreadForAgent(
  cfg: AppConfig,
  agentId: string,
): string | null {
  return cfg.threadIdByAgent[agentId] ?? null;
}

export function withThreadForAgent(
  cfg: AppConfig,
  agentId: string,
  threadId: string,
): AppConfig {
  return {
    ...cfg,
    lastAgentId: agentId,
    threadIdByAgent: { ...cfg.threadIdByAgent, [agentId]: threadId },
  };
}

export function withMascot(cfg: AppConfig, mascotId: MascotId): AppConfig {
  return { ...cfg, mascotId };
}
