# Octop Desktop Pet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Tauri 2 desktop pet that floats an Octop webp mascot, chats with a remote Octop server via compact streaming chat, and exposes tray actions for mascot, home, and settings.

**Architecture:** Dual always-on-top pet window + hideable chat window + settings window, one React SPA routed by Tauri window label. HTTP/WS client talks to remote Octop (`/api/auth/login`, `/api/agents`, `/api/agents/{id}/threads`, `/api/agents/{id}/chat/ws`). App config in a JSON store; password + token in OS keyring via a Rust command.

**Tech Stack:** Tauri 2, React 18, TypeScript, Vite, Vitest, `@tauri-apps/plugin-store`, Rust `keyring` crate, `react-markdown` (chat text).

**Spec:** `docs/superpowers/specs/2026-08-04-octop-desktop-pet-design.md`

## Global Constraints

- Independent repo `octop-pet`; do not modify the Octop server monorepo for v1
- Primary platform macOS; keep Windows-safe Tauri APIs (no mac-only APIs without `#[cfg]`)
- Mascots: animated webp only in v1 — copy from Octop `dashboard/public/octop-mascot-peek.webp` and `octop-mascot-type.webp`
- Compact chat only: no attachments, tool cards, docks, multi-thread sidebar
- Persist `threadIdByAgent: Record<string, string>` + `lastAgentId`
- Agent switch resumes that agent’s mapped thread (or creates one)
- Open home = system browser to `{baseUrl}/`
- Secrets (`password`, `access_token`) go through OS keyring commands — never plain JSON
- Prefer Chinese UI copy for user-facing strings in v1 (match Octop dashboard audience)
- Commits: small, one logical change each; do not skip hooks unless blocked

---

## File structure (target)

```
octop-pet/
  package.json
  vite.config.ts
  vitest.config.ts
  index.html
  public/mascots/
    peek.webp
    type.webp
  src/
    main.tsx                 # pick root by window label
    App.css
    windows/
      PetWindow.tsx
      ChatWindow.tsx
      SettingsWindow.tsx
    lib/
      types.ts               # AppConfig, AgentSummary, ChatMessage, …
      configLogic.ts         # pure helpers + thread map
      configLogic.test.ts
      octopHttp.ts           # login / agents / threads / history
      octopHttp.test.ts
      chatStream.ts          # WS send + reduce token frames
      chatStream.test.ts
      tauriApi.ts            # invoke wrappers
    components/
      MascotImage.tsx
      MessageList.tsx
      Composer.tsx
      AgentSelect.tsx
      ConnectionBadge.tsx
  src-tauri/
    Cargo.toml
    tauri.conf.json
    icons/…
    src/
      lib.rs
      main.rs
      config_cmd.rs          # load/save AppConfig JSON (no secrets)
      secrets_cmd.rs         # keyring get/set/delete
      window_cmd.rs          # show/hide/position chat; open URL
      tray.rs                # tray menu wiring
  docs/…
```

---

### Task 1: Scaffold Tauri 2 + React + Vitest + mascots

**Files:**
- Create: entire Vite/Tauri scaffold via CLI (force into existing repo)
- Create: `public/mascots/peek.webp`, `public/mascots/type.webp` (copied)
- Create: `vitest.config.ts`, `src/lib/.gitkeep`
- Modify: `package.json` scripts (`test`, `tauri`)
- Modify: `README.md` (minimal run instructions)

**Interfaces:**
- Consumes: none
- Produces: runnable `npm run tauri dev` project; vitest available

- [ ] **Step 1: Scaffold into the repo root**

```bash
cd /Users/jubaoliang/Workspaces/orcakit/octop-pet
npm create tauri-app@latest . -- -y -f -m npm -t react-ts --tauri-version 2 --identifier com.octop.pet
```

If the CLI refuses a custom name when using `.`, use project name `octop-pet` with `-f` and move generated files up, or accept generated `package.json` name `octop-pet`.

- [ ] **Step 2: Install deps + Vitest**

```bash
npm install
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
npm install @tauri-apps/plugin-store react-markdown
```

Add to `package.json`:

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
```

- [ ] **Step 3: Copy mascots**

```bash
mkdir -p public/mascots
cp /Users/jubaoliang/Workspaces/orcakit/Octop/dashboard/public/octop-mascot-peek.webp public/mascots/peek.webp
cp /Users/jubaoliang/Workspaces/orcakit/Octop/dashboard/public/octop-mascot-type.webp public/mascots/type.webp
```

- [ ] **Step 4: Smoke-check TypeScript**

```bash
npx tsc --noEmit
npm test || true
```

Expected: `tsc` clean (or only scaffold defaults); vitest may report no tests yet — that is OK until Task 2.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: scaffold Tauri 2 React app and copy mascot assets

EOF
)"
```

---

### Task 2: Config types + thread-map helpers (TDD)

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/configLogic.ts`
- Create: `src/lib/configLogic.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `export type MascotId = "peek" | "type"`
  - `export interface AppConfig { baseUrl: string; username: string; mascotId: MascotId; lastAgentId: string | null; threadIdByAgent: Record<string, string>; petX: number | null; petY: number | null; }`
  - `export const DEFAULT_APP_CONFIG: AppConfig`
  - `export const MASCOT_SRC: Record<MascotId, string>`
  - `export function normalizeBaseUrl(raw: string): string`
  - `export function resolveThreadForAgent(cfg: AppConfig, agentId: string): string | null`
  - `export function withThreadForAgent(cfg: AppConfig, agentId: string, threadId: string): AppConfig`
  - `export function withMascot(cfg: AppConfig, mascotId: MascotId): AppConfig`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/configLogic.test.ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_CONFIG,
  normalizeBaseUrl,
  resolveThreadForAgent,
  withThreadForAgent,
  withMascot,
} from "./configLogic";

describe("normalizeBaseUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeBaseUrl("https://octop.example.com/")).toBe(
      "https://octop.example.com",
    );
  });
  it("rejects empty", () => {
    expect(() => normalizeBaseUrl("  ")).toThrow();
  });
});

describe("thread map", () => {
  it("resolves and updates per agent without clobbering others", () => {
    let cfg = DEFAULT_APP_CONFIG;
    cfg = withThreadForAgent(cfg, "a1", "t1");
    cfg = withThreadForAgent(cfg, "a2", "t2");
    expect(resolveThreadForAgent(cfg, "a1")).toBe("t1");
    expect(resolveThreadForAgent(cfg, "a2")).toBe("t2");
    cfg = withThreadForAgent(cfg, "a1", "t1b");
    expect(resolveThreadForAgent(cfg, "a1")).toBe("t1b");
    expect(resolveThreadForAgent(cfg, "a2")).toBe("t2");
  });
});

describe("withMascot", () => {
  it("sets mascot id", () => {
    expect(withMascot(DEFAULT_APP_CONFIG, "type").mascotId).toBe("type");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- src/lib/configLogic.test.ts
```

Expected: FAIL (module not found / exports missing)

- [ ] **Step 3: Implement**

```ts
// src/lib/types.ts
export type MascotId = "peek" | "type";

export interface AppConfig {
  baseUrl: string;
  username: string;
  mascotId: MascotId;
  lastAgentId: string | null;
  threadIdByAgent: Record<string, string>;
  petX: number | null;
  petY: number | null;
}

export interface AgentSummary {
  id: string;
  name: string;
  state?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  pending?: boolean;
  error?: string;
}
```

```ts
// src/lib/configLogic.ts
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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- src/lib/configLogic.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/configLogic.ts src/lib/configLogic.test.ts
git commit -m "$(cat <<'EOF'
feat: add app config types and per-agent thread helpers

EOF
)"
```

---

### Task 3: Octop HTTP client (login, agents, threads, history)

**Files:**
- Create: `src/lib/octopHttp.ts`
- Create: `src/lib/octopHttp.test.ts`

**Interfaces:**
- Consumes: `normalizeBaseUrl`, `AgentSummary`
- Produces:
  - `export class OctopHttpError extends Error { status: number; body: string }`
  - `export async function login(baseUrl, username, password): Promise<{ access_token: string; expires_in: number }>`
  - `export async function listAgents(baseUrl, token): Promise<AgentSummary[]>`
  - `export async function createThread(baseUrl, token, agentId): Promise<{ thread_id: string; session_key: string }>`
  - `export async function getHistory(baseUrl, token, agentId, threadId): Promise<{ messages: Array<{ role: string; content: unknown }> }>`
  - `export function extractTextContent(content: unknown): string`

API paths (prefix `{baseUrl}/api`):

| Action | Method / path |
|--------|----------------|
| Login | `POST /auth/login` body `{username,password}` |
| Agents | `GET /agents` |
| Create thread | `POST /agents/{id}/threads` |
| History | `GET /agents/{id}/threads/{threadId}/history?limit=50&offset=0` |

Agent list items: use `id` or `agent_id` field (prefer `id`, fallback `agent_id`).

- [ ] **Step 1: Write failing tests with mocked `fetch`**

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { login, listAgents, createThread, extractTextContent } from "./octopHttp";

describe("octopHttp", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("login posts credentials and returns token", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "tok", expires_in: 3600 }),
    });
    const res = await login("https://h.example", "u", "p");
    expect(res.access_token).toBe("tok");
    expect(fetch).toHaveBeenCalledWith(
      "https://h.example/api/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("listAgents maps id/name", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [{ id: "a1", name: "Bot" }],
    });
    const agents = await listAgents("https://h.example", "tok");
    expect(agents).toEqual([{ id: "a1", name: "Bot", state: undefined }]);
  });

  it("createThread returns thread_id", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ thread_id: "th1", session_key: "sk" }),
    });
    const t = await createThread("https://h.example", "tok", "a1");
    expect(t.thread_id).toBe("th1");
  });

  it("extractTextContent flattens string or text parts", () => {
    expect(extractTextContent("hi")).toBe("hi");
    expect(
      extractTextContent([{ type: "text", text: "a" }, { type: "text", text: "b" }]),
    ).toBe("ab");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- src/lib/octopHttp.test.ts
```

- [ ] **Step 3: Implement `octopHttp.ts`**

```ts
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
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- src/lib/octopHttp.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/octopHttp.ts src/lib/octopHttp.test.ts
git commit -m "$(cat <<'EOF'
feat: add Octop HTTP client for login, agents, and threads

EOF
)"
```

---

### Task 4: Chat WebSocket stream reducer (TDD)

**Files:**
- Create: `src/lib/chatStream.ts`
- Create: `src/lib/chatStream.test.ts`

**Interfaces:**
- Consumes: none (pure WS URL + frame helpers; live `WebSocket` injected for tests)
- Produces:
  - `export function buildChatWsUrl(baseUrl: string, agentId: string, token: string): string`
  - `export function buildUserTurnPayload(args: { text: string; threadId: string; sessionKey?: string }): object`
  - `export function applyStreamChunk(prevAssistantText: string, chunk: unknown): { text: string; done: boolean; error?: string }`
  - `export function buildCancelPayload(threadId: string): object`

Stream frames (from Octop dashboard): `{type:"token", content:"…"}`, `{type:"done"}`, `{type:"error", message}`, `{type:"cancel"}` send side.

WS URL: `{ws|wss}://{host}/api/agents/{id}/chat/ws?token=…` derived from `baseUrl`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildChatWsUrl,
  buildUserTurnPayload,
  applyStreamChunk,
  buildCancelPayload,
} from "./chatStream";

describe("chatStream", () => {
  it("builds ws url with token", () => {
    expect(buildChatWsUrl("https://h.example", "a1", "tok")).toBe(
      "wss://h.example/api/agents/a1/chat/ws?token=tok",
    );
    expect(buildChatWsUrl("http://localhost:8787", "a1", "tok")).toBe(
      "ws://localhost:8787/api/agents/a1/chat/ws?token=tok",
    );
  });

  it("builds user_turn payload", () => {
    expect(buildUserTurnPayload({ text: "hi", threadId: "t1" })).toEqual({
      type: "user_turn",
      text: "hi",
      thread_id: "t1",
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("accumulates tokens and finishes on done/error", () => {
    let t = "";
    let r = applyStreamChunk(t, { type: "token", content: "Hel" });
    expect(r).toEqual({ text: "Hel", done: false });
    r = applyStreamChunk(r.text, { type: "token", content: "lo" });
    expect(r).toEqual({ text: "Hello", done: false });
    r = applyStreamChunk(r.text, { type: "done" });
    expect(r.done).toBe(true);
    r = applyStreamChunk("", { type: "error", message: "boom" });
    expect(r).toEqual({ text: "", done: true, error: "boom" });
  });

  it("builds cancel payload", () => {
    expect(buildCancelPayload("t1")).toEqual({ type: "cancel", thread_id: "t1" });
  });
});
```

- [ ] **Step 2: Run — FAIL**

```bash
npm test -- src/lib/chatStream.test.ts
```

- [ ] **Step 3: Implement `chatStream.ts`**

```ts
import { normalizeBaseUrl } from "./configLogic";

export function buildChatWsUrl(
  baseUrl: string,
  agentId: string,
  token: string,
): string {
  const root = normalizeBaseUrl(baseUrl);
  const u = new URL(root);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = `/api/agents/${encodeURIComponent(agentId)}/chat/ws`;
  u.search = "";
  u.searchParams.set("token", token);
  return u.toString();
}

export function buildUserTurnPayload(args: {
  text: string;
  threadId: string;
  sessionKey?: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type: "user_turn",
    text: args.text,
    thread_id: args.threadId,
    messages: [{ role: "user", content: args.text }],
  };
  if (args.sessionKey) payload.session_key = args.sessionKey;
  return payload;
}

export function buildCancelPayload(threadId: string): Record<string, unknown> {
  return { type: "cancel", thread_id: threadId };
}

export function applyStreamChunk(
  prevAssistantText: string,
  chunk: unknown,
): { text: string; done: boolean; error?: string } {
  if (!chunk || typeof chunk !== "object") {
    return { text: prevAssistantText, done: false };
  }
  const c = chunk as { type?: string; content?: string; message?: string };
  if (c.type === "token" && typeof c.content === "string") {
    return { text: prevAssistantText + c.content, done: false };
  }
  if (c.type === "done") return { text: prevAssistantText, done: true };
  if (c.type === "error") {
    return {
      text: prevAssistantText,
      done: true,
      error: c.message || "流式错误",
    };
  }
  return { text: prevAssistantText, done: false };
}
```

- [ ] **Step 4: Run — PASS**

```bash
npm test -- src/lib/chatStream.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/chatStream.ts src/lib/chatStream.test.ts
git commit -m "$(cat <<'EOF'
feat: add chat WS URL and stream chunk reducer

EOF
)"
```

---

### Task 5: Tauri commands — config store, keyring secrets, open URL, windows

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `keyring`, `serde`, `serde_json`, `tauri-plugin-store` if needed)
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/config_cmd.rs`
- Create: `src-tauri/src/secrets_cmd.rs`
- Create: `src-tauri/src/window_cmd.rs`
- Create: `src/lib/tauriApi.ts`
- Modify: `src-tauri/capabilities/default.json` (allow commands + opener)
- Modify: `src-tauri/tauri.conf.json` (multi-window labels: `pet`, `chat`, `settings`)

**Interfaces:**
- Consumes: `AppConfig` JSON shape matching `src/lib/types.ts`
- Produces Tauri commands:
  - `load_config() -> AppConfig`
  - `save_config(cfg: AppConfig)`
  - `get_secret(key: string) -> Option<string>` keys: `password`, `access_token`
  - `set_secret(key: string, value: string)`
  - `delete_secret(key: string)`
  - `open_home(base_url: string)`
  - `show_chat_near_pet()`
  - `hide_chat()`
  - `show_settings()`
  - `set_pet_position(x: f64, y: f64)` / persist via config save from frontend

Keyring service name: `com.octop.pet`, account: `{username}|{key}` or fixed accounts `octop-pet-password` / `octop-pet-token` scoped by username hash — use `format!("{}:{}", username, key)` with username from config.

Windows in `tauri.conf.json`:

```json
"app": {
  "windows": [
    {
      "label": "pet",
      "title": "Octop Pet",
      "width": 160,
      "height": 160,
      "decorations": false,
      "transparent": true,
      "alwaysOnTop": true,
      "resizable": false,
      "skipTaskbar": true
    },
    {
      "label": "chat",
      "title": "Octop Chat",
      "width": 420,
      "height": 560,
      "visible": false,
      "decorations": true,
      "resizable": true
    },
    {
      "label": "settings",
      "title": "Octop Pet 设置",
      "width": 420,
      "height": 360,
      "visible": false,
      "resizable": false
    }
  ]
}
```

`show_chat_near_pet`: read pet outer position/size; place chat to the right (or left if overflowing), clamp to monitor work area.

`open_home`: use `tauri-plugin-opener` / `open` crate to open `{baseUrl}/`.

- [ ] **Step 1: Add Rust deps and stub commands that compile**

Implement the command modules with real keyring + JSON file under app config dir (`app_config_dir()/config.json`).

- [ ] **Step 2: Add `src/lib/tauriApi.ts` invoke wrappers**

```ts
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig } from "./types";

export const tauriApi = {
  loadConfig: () => invoke<AppConfig>("load_config"),
  saveConfig: (cfg: AppConfig) => invoke<void>("save_config", { cfg }),
  getSecret: (key: string) => invoke<string | null>("get_secret", { key }),
  setSecret: (key: string, value: string) =>
    invoke<void>("set_secret", { key, value }),
  deleteSecret: (key: string) => invoke<void>("delete_secret", { key }),
  openHome: (baseUrl: string) => invoke<void>("open_home", { baseUrl }),
  showChatNearPet: () => invoke<void>("show_chat_near_pet"),
  hideChat: () => invoke<void>("hide_chat"),
  showSettings: () => invoke<void>("show_settings"),
};
```

- [ ] **Step 3: `cargo check` in `src-tauri`**

```bash
cd src-tauri && cargo check
```

Expected: success

- [ ] **Step 4: Commit**

```bash
git add src-tauri src/lib/tauriApi.ts
git commit -m "$(cat <<'EOF'
feat: add Tauri config, keyring, and window commands

EOF
)"
```

---

### Task 6: System tray menu

**Files:**
- Create: `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/lib.rs` (setup tray on startup)
- Modify: capabilities for tray

**Interfaces:**
- Consumes: window labels; `open_home`; config load for mascot + baseUrl
- Produces tray menu:
  - 显示/隐藏宠物
  - 选择形象 → peek / type (emit event `mascot-changed` to pet window OR write config + emit)
  - 打开主页
  - 设置…
  - 退出

Prefer: tray handlers call the same commands as frontend (`show_settings`, `open_home`, toggle pet visibility, update mascot in config file + `app.emit("mascot-changed", id)`).

- [ ] **Step 1: Implement tray with `tauri::tray` / `TrayIconBuilder` (Tauri 2 API)**

- [ ] **Step 2: Manual verify checklist** (document in commit body if GUI can’t run in CI): menu items present; Quit works

- [ ] **Step 3: `cargo check`**

- [ ] **Step 4: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat: add system tray menu for pet, mascot, home, settings

EOF
)"
```

---

### Task 7: Pet window UI

**Files:**
- Create: `src/windows/PetWindow.tsx`
- Create: `src/components/MascotImage.tsx`
- Modify: `src/main.tsx` to render by window label
- Modify: CSS for transparent body on pet

**Interfaces:**
- Consumes: `MASCOT_SRC`, `tauriApi`, `listen("mascot-changed")`
- Produces: clickable/draggable pet

Behavior:
- Load config → show mascot webp
- Listen `mascot-changed`
- Drag: use Tauri window startDragging on pointer down (data-tauri-drag-region) **but** distinguish click vs drag: on pointerup without movement → `show_chat_near_pet`
- Persist position on drag end via `saveConfig` petX/petY + `setPosition`

- [ ] **Step 1: Implement `main.tsx` router**

```tsx
import { getCurrentWindow } from "@tauri-apps/api/window";
import PetWindow from "./windows/PetWindow";
import ChatWindow from "./windows/ChatWindow";
import SettingsWindow from "./windows/SettingsWindow";

const label = getCurrentWindow().label;
const root =
  label === "chat" ? <ChatWindow /> :
  label === "settings" ? <SettingsWindow /> :
  <PetWindow />;
```

Stub empty `ChatWindow` / `SettingsWindow` if not yet built (temporary placeholders).

- [ ] **Step 2: Implement PetWindow + MascotImage**

- [ ] **Step 3: Commit**

```bash
git add src
git commit -m "$(cat <<'EOF'
feat: render floating pet window with selectable webp mascot

EOF
)"
```

---

### Task 8: Settings window UI + login test

**Files:**
- Create: `src/windows/SettingsWindow.tsx`
- Modify: placeholders from Task 7

**Interfaces:**
- Consumes: `tauriApi`, `login`, `normalizeBaseUrl`
- Produces: form fields baseUrl / username / password; buttons 保存、测试连接

Flow:
1. Load config + `get_secret("password")` into form (token not shown)
2. Save → `normalizeBaseUrl`, `save_config`, `set_secret("password", …)`
3. Test → `login` → `set_secret("access_token", token)` → show success/error

- [ ] **Step 1: Implement SettingsWindow**

- [ ] **Step 2: Commit**

```bash
git add src/windows/SettingsWindow.tsx
git commit -m "$(cat <<'EOF'
feat: add settings window for remote Octop credentials

EOF
)"
```

---

### Task 9: Chat window — agents, history resume, streaming send

**Files:**
- Create: `src/windows/ChatWindow.tsx`
- Create: `src/components/MessageList.tsx`
- Create: `src/components/Composer.tsx`
- Create: `src/components/AgentSelect.tsx`
- Create: `src/components/ConnectionBadge.tsx`

**Interfaces:**
- Consumes: all `lib/*`, `tauriApi`
- Produces: full compact chat UX

Flow on mount / show:
1. `loadConfig` + `get_secret("access_token")` (+ password for 401 retry once)
2. If no token → prompt to open settings
3. `listAgents` → pick `lastAgentId` or first
4. `resolveThreadForAgent` → if set, `getHistory` (on 404 → createThread); else `createThread` + `withThreadForAgent` + `saveConfig`
5. Send: append user msg; open WS; `user_turn`; apply `token` chunks to pending assistant; on `done` finalize; on abort send `cancel`
6. Agent change: switch id; resume/create thread as above; reload messages

UI:
- Top: `AgentSelect` + `ConnectionBadge`
- Middle: `MessageList` (react-markdown for assistant)
- Bottom: `Composer` with Send + Stop

Ignore tool/reasoning frames in v1 (reducer already skips non-token).

- [ ] **Step 1: Implement components + ChatWindow**

- [ ] **Step 2: Run unit tests still green**

```bash
npm test
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src
git commit -m "$(cat <<'EOF'
feat: add compact chat window with agent switch and streaming

EOF
)"
```

---

### Task 10: README, packaging notes, end-to-end smoke

**Files:**
- Modify: `README.md`
- Modify: `src-tauri/tauri.conf.json` bundle identifier / productName `Octop Pet`

**Interfaces:** none new

- [ ] **Step 1: Write README** — install Rust/Node, `npm install`, `npm run tauri dev`, configure settings, macOS notes for transparent window / accessibility if needed

- [ ] **Step 2: Try `npm run tauri build` on macOS** (if environment allows). If signing fails, document unsigned local build.

- [ ] **Step 3: Final verification**

```bash
npm test
npx tsc --noEmit
cd src-tauri && cargo check
```

- [ ] **Step 4: Commit**

```bash
git add README.md src-tauri/tauri.conf.json
git commit -m "$(cat <<'EOF'
docs: add run/build notes for Octop desktop pet

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Floating webp pet, selectable mascots | 1, 6, 7 |
| Tray: mascot / home / settings / quit | 6 |
| Remote URL + user + password | 5, 8 |
| Compact chat + stream + agent switch | 4, 9 |
| Per-agent thread resume | 2, 9 |
| Open home in system browser | 5, 6 |
| Dual windows + settings window | 5, 7–9 |
| Keyring for secrets | 5 |
| macOS first / Windows-plausible | 1, 5, 10 |
| Unit tests for core logic | 2–4 |

## Self-review notes

- Threads API uses `/agents/{id}/threads` (dashboard live path), not the older `chat/sessions` name in docs/api.md
- WS auth via `?token=` query matches dashboard `wsChat.ts`
- Stream text from `{type:"token", content}` only in v1
