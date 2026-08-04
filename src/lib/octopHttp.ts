import { normalizeBaseUrl } from "./configLogic";
import type { AgentSummary } from "./types";

export class OctopHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

async function api<T>(
  baseUrl: string,
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const root = normalizeBaseUrl(baseUrl);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  const { token: _t, ...rest } = init;
  const res = await fetch(`${root}/api${path}`, { ...rest, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new OctopHttpError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function login(
  baseUrl: string,
  username: string,
  password: string,
): Promise<{ access_token: string; expires_in: number }> {
  return api(baseUrl, "/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function listAgents(
  baseUrl: string,
  token: string,
): Promise<AgentSummary[]> {
  const rows = await api<any[]>(baseUrl, "/agents", { token });
  return rows.map((r) => ({
    id: String(r.id ?? r.agent_id),
    name: String(r.name ?? r.id ?? r.agent_id),
    state: r.state != null ? String(r.state) : undefined,
  }));
}

export async function createThread(
  baseUrl: string,
  token: string,
  agentId: string,
): Promise<{ thread_id: string; session_key: string }> {
  return api(baseUrl, `/agents/${encodeURIComponent(agentId)}/threads`, {
    method: "POST",
    token,
  });
}

export async function getHistory(
  baseUrl: string,
  token: string,
  agentId: string,
  threadId: string,
): Promise<{ messages: Array<{ role: string; content: unknown }> }> {
  return api(
    baseUrl,
    `/agents/${encodeURIComponent(agentId)}/threads/${encodeURIComponent(threadId)}/history?limit=50&offset=0`,
    { token },
  );
}

export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  if (content && typeof content === "object" && "text" in content) {
    return String((content as { text: unknown }).text ?? "");
  }
  return "";
}
