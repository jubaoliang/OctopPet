# AGENTS.md

Navigation guide for AI coding agents working in **octop-pet**.

## 1. Collaboration principles

> Favor caution over speed; trivial tasks may relax these rules.

### Think before writing

- State assumptions up front; ask when unsure — do not guess.
- When multiple interpretations exist, list them and let the user choose.
- Suggest simpler approaches when they exist; stop when blocked and name what is unclear.

### Simplicity first

- Write the minimum code that solves the problem; no unrequested features or abstractions.
- Do not add defensive error handling for scenarios that cannot realistically happen.
- Trim the diff when it grows unnecessarily large.

### Surgical edits

- Touch only lines directly related to the task; do not opportunistically clean up nearby code.
- Do not refactor working code or unify style just because it differs from yours.
- Remove orphan imports, variables, and functions **you** introduced.

### Verifiable outcomes

- Turn tasks into verifiable goals (what to test, which command proves success).
- Before saying "done", provide verification evidence; the default ship bar is **`make all` green**.

## 2. What this is

**Octop Pet** — desktop companion for a remote [Octop](https://github.com/TencentCloud/Octop) server.

- **Tauri 2** (Rust): tray, multi-window, config, keyring, global shortcuts
- **React 19 + TypeScript + Vite**: pet, chat, and settings surfaces in one SPA
- **Runtime dependency:** a reachable Octop HTTP/WebSocket API — **no Octop source tree at runtime**

Design specs:

- [Desktop pet design](docs/superpowers/specs/2026-08-04-octop-desktop-pet-design.md)
- [Pet window UX](docs/superpowers/specs/2026-08-04-pet-window-ux-design.md)

## 3. Tech stack

| Layer          | Technology                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Desktop        | Tauri 2, Rust stable                                                                                              |
| UI             | React 19, TypeScript, Vite 7                                                                                      |
| HTTP           | `@tauri-apps/plugin-http` (Tauri) / `fetch` (Vitest)                                                              |
| WebSocket      | Browser `WebSocket` in chat window                                                                                |
| Config         | JSON file via Rust `config_cmd` + `@tauri-apps/plugin-store`                                                      |
| Secrets        | Rust `secrets_cmd` → OS keyring                                                                                   |
| Markdown       | `react-markdown` + `remark-gfm`                                                                                   |
| Frontend tests | Vitest 3, Testing Library, jsdom                                                                                  |
| Rust tests     | `cargo test` in `src-tauri/tests/`                                                                                |
| CI             | GitHub Actions — Ubuntu (`ci.yml`: test + typecheck + cargo) + tag release (`release.yml`: macOS ×2 + Windows ×2) |

## 4. Project layout

```
src/
  main.tsx                 routes by Tauri window label (pet | chat | settings)
  App.css                  global styles; window-specific via data-window-label
  windows/
    PetWindow.tsx          floating mascot, drag, context menu
    ChatWindow.tsx         chat state machine, streaming, init/retry
    SettingsWindow.tsx     credentials, hotkeys, mascot picker
  components/
    Composer.tsx           input, agent/model/connector pickers, attachments
    MessageList.tsx        history + assistant actions (copy/retry/speak)
    AgentSelect.tsx        agent dropdown
    AssistantMarkdown.tsx  streaming-safe Markdown
    QueuedMessages.tsx     pending queue while streaming
    ShortcutRecorder.tsx   global shortcut capture
    …
  lib/
    octopHttp.ts           login, agents, threads, history, uploads
    octopTypes.ts          Octop DTOs + model/attachment helpers
    chatStream.ts          WS URL, payloads, stream chunk reducer
    chatHelpers.ts         chat constants, history mapping, error text
    configLogic.ts         thread map helpers, base URL normalization
    tauriApi.ts            invoke + event wrappers
    tauriWindowApi.ts      window sizing, hide, drag, resize
    messageQueue.ts        queue data structure
    streamStatus.ts        tool/status labels during stream
    stabilizeStreamingMarkdown.ts
    shortcutFormat.ts
    types.ts               shared TS types (mirror Rust config field names in camelCase)
  hooks/
    useChatController.ts   chat init, auth, streaming, queue, layout
    useWindowChrome.ts     auto-fit window height, Escape to hide
  styles/
    base.css, pet.css, settings.css, chat.css
src-tauri/src/
  lib.rs                   Tauri builder, plugins, command registration
  main.rs                  entry
  tray.rs                  system tray menu + global shortcuts
  window_cmd.rs            show/hide/place windows, browser open, chat-shown event
  config_cmd.rs            config.json load/save/patch
  secrets_cmd.rs           keyring get/set/delete (scoped by username)
  tests/                   (via src-tauri/tests/command_logic.rs)
docs/superpowers/          design specs and implementation plans
.githooks/pre-commit       runs `make all`
```

## 5. Module boundaries

**Rule:** dependencies flow **inward** — UI → `lib/*` → `tauriApi` / pure helpers; Rust shell has no React knowledge.

| Layer                    | Role                                | May import                            | Must NOT                                                     |
| ------------------------ | ----------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| `windows/*`              | Window-level state, effects, layout | `components/*`, `lib/*`, `hooks/*`    | direct `@tauri-apps/api` (use `tauriApi` / `tauriWindowApi`) |
| `components/*`           | Presentational / local UI state     | `lib/*` types and pure helpers        | `octopHttp` network calls (receive callbacks from windows)   |
| `hooks/*`                | Reusable window/session effects     | `lib/*`, `tauriApi`, `tauriWindowApi` | business logic duplicated from lib                           |
| `lib/octopHttp.ts`       | Remote Octop HTTP API               | `configLogic`, `octopTypes`           | React, Tauri invoke                                          |
| `lib/octopTypes.ts`      | DTOs + attachment/model helpers     | nothing from windows                  | network, Tauri                                               |
| `lib/chatStream.ts`      | WS protocol (client-side)           | pure utilities                        | React, Tauri                                                 |
| `lib/tauriApi.ts`        | Tauri invoke + app events           | `@tauri-apps/api`                     | business logic                                               |
| `lib/tauriWindowApi.ts`  | Tauri window surface                | `@tauri-apps/api/window`              | business logic                                               |
| `lib/tauriWebviewApi.ts` | Pet webview window surface          | `@tauri-apps/api/window`              | business logic                                               |
| `lib/petContextMenu.ts`  | Native pet context menu             | `@tauri-apps/api/menu`                | business logic                                               |
| `lib/configLogic.ts`     | Pure config/thread helpers          | nothing from windows                  | network, Tauri                                               |
| `src-tauri/*`            | Native shell                        | Tauri crates, local modules           | frontend code                                                |

**Hard bans**

- Do **not** add Octop Python/server code to this repo.
- Do **not** change Octop server APIs here — open a separate PR in [Octop](https://github.com/TencentCloud/Octop) if the contract must change.
- Do **not** store passwords or tokens in `config.json` — keyring only.
- Do **not** log secrets.

### Rust command surface

| Command module | Owns                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `config_cmd`   | `AppConfig` serde types, `load_config` / `save_config` / `patch_config`, mascot validation     |
| `secrets_cmd`  | Keyring read/write scoped by username + known secret keys (`password`, `access_token`)         |
| `window_cmd`   | Window placement, show/hide chat & settings, `open_home`, emit `chat-shown` / used by settings |
| `tray.rs`      | Tray menu, global shortcut registration from config                                            |

Frontend ↔ Rust contract: field names in TS `AppConfig` use **camelCase**; Rust uses `#[serde(rename_all = "camelCase")]`.

## 6. Key patterns

### Window routing

`src/main.tsx` reads `getCurrentWindow().label` and mounts exactly one root:

| Label      | Component        | First-show behavior                    |
| ---------- | ---------------- | -------------------------------------- |
| `pet`      | `PetWindow`      | visible on launch                      |
| `chat`     | `ChatWindow`     | hidden; shown via `show_chat_near_pet` |
| `settings` | `SettingsWindow` | hidden; shown via tray / gate UI       |

Close on chat/settings = **hide**, not quit. Quit only from tray.

### Tauri events (frontend listens via `tauriApi`)

| Event            | Emitted when                 | Handler                                                                |
| ---------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `auth-updated`   | Settings saved credentials   | `ChatWindow` → `initialize()`                                          |
| `chat-shown`     | Chat window shown after hide | `ChatWindow` → retry `initialize()` if `connection === "disconnected"` |
| `settings-shown` | Settings window shown        | refit window height                                                    |
| `mascot-changed` | Mascot switched              | pet + settings sync                                                    |

Prefer emitting events from Rust (`window_cmd`, settings show) over polling visibility when adding new "on open" behavior.

### Auth & token recovery

1. Settings **Test connection** / **Save** → `login()` → store token in keyring → `emitAuthUpdated()`
2. Chat `authorized()` wrapper: on **401**, delete token, silent re-login with stored password once, retry request
3. Silent login failure → clear token, `showSettings()`, show gate UI

### Chat initialization sequence

`ChatWindow.initialize()`:

1. Load config + access token
2. No token → `needsSettings` gate
3. `listAgents` → pick `lastAgentId` or first agent
4. `openAgent(id)` → resolve/create thread, load history, set `connected`

Use `loadSequenceRef` to ignore stale async results after unmount or superseding init.

### Streaming

- `buildChatWsUrl(baseUrl, agentId, token)` → WebSocket URL
- `applyStreamChunk` reduces token/done/error events
- `stopStream` sends cancel frame when thread exists, closes socket
- Message queue (`messageQueue.ts`) holds user sends during active stream; flushed when stream finishes

### Config & thread map

- `threadIdByAgent: Record<agentId, threadId>` persisted via `patchConfig`
- `resolveThreadForAgent` / `withThreadForAgent` in `configLogic.ts`
- History 404 → create new thread, update map

### Network errors

`octopHttp.networkError()` maps browser/Tauri fetch failures (including `error sending request`) to user-facing Chinese hints when appropriate. Production paths go through `octopHttp`; tests that mock `listAgents` directly may see raw error strings.

### macOS transparency

Pet window must stay transparent when chat steals focus. Rust: `ensure_pet_transparent` / `ensure_pet_transparent_after_focus_race`. Pet frontend: `clearPetChrome` on focus/visibility. Do not reintroduce opaque backgrounds on `html`/`body` for the pet window.

## 7. Run commands

```bash
make install              # npm install
make install-hooks        # once per clone → .githooks/pre-commit
make dev                  # npm run tauri dev
make all                  # ship bar: format + lint + typecheck + test
make check                # CI: lint + typecheck + test (no auto-format)
make format               # cargo fmt + prettier --write
make lint                 # fmt check + clippy + prettier check + eslint
make test                 # vitest run
make typecheck            # tsc --noEmit + cargo check
make cargo-test           # cargo test in src-tauri
make build                # npm run tauri build
make clean                # dist + cargo clean
```

**Git hooks:** after cloning, run **`make install-hooks`** once. Pre-commit runs **`make all`**. Bypass only in emergencies: `SKIP_PRECOMMIT=1 git commit …` or `git commit --no-verify`.

Default verification before claiming "done": **`make all` green**.

## 8. Testing conventions

- Frontend: `*.test.ts` / `*.test.tsx` next to sources; `@vitest-environment jsdom` for components
- Mock **`tauriApi`** and **`octopHttp`** in window tests — no real Tauri or network
- Rust: integration-style tests in `src-tauri/tests/command_logic.rs` for config/secrets/window logic
- Fake WebSocket pattern in `ChatWindow.test.tsx` for stream tests

CI runs on **Ubuntu** only; still avoid hard-coding macOS-only paths in shared test assertions without reason.

## 9. Do not

- Do not invoke Tauri commands outside `tauriApi.ts`
- Do not duplicate Octop HTTP paths — keep them in `octopHttp.ts`
- Do not add features from the design spec's **Non-goals** (docks, multi-thread sidebar, auto-start, click-through pet) unless explicitly requested
- Do not commit secrets, `.env`, signing certs — see `.gitignore` and [SECURITY.md](SECURITY.md)
- Do not edit `src-tauri/icons/` or generated Tauri assets unless the task is branding/packaging
- Do not skip `make all` to land red tests

## 10. Where to look

| Question                   | Location                                                                         |
| -------------------------- | -------------------------------------------------------------------------------- |
| How does login work?       | `SettingsWindow.tsx`, `octopHttp.login`, `secrets_cmd.rs`                        |
| Chat init & retry on show  | `ChatWindow.tsx` → `initialize`, `listenChatShown`                               |
| Thread resume per agent    | `configLogic.ts`, `ChatWindow.openAgent`                                         |
| WebSocket protocol         | `chatStream.ts`; mirror Octop dashboard chat hooks                               |
| Window show/hide/placement | `window_cmd.rs`, `tauriApi.ts`                                                   |
| Tray menu & shortcuts      | `tray.rs`, `SettingsWindow` hotkey fields                                        |
| Config persistence         | `config_cmd.rs`, `AppConfig` in Rust + `types.ts`                                |
| HTTP capability allowlist  | `src-tauri/capabilities/default.json`                                            |
| Pet transparency           | `PetWindow.tsx`, `window_cmd.rs` `ensure_pet_transparent*`                       |
| Octop server API reference | [Octop docs/api.md](https://github.com/TencentCloud/Octop/blob/main/docs/api.md) |
| Design intent              | `docs/superpowers/specs/`                                                        |
| Pre-commit hook            | `.githooks/pre-commit`, `Makefile`                                               |
| Contributing / PR flow     | [CONTRIBUTING.md](CONTRIBUTING.md)                                               |
| Security reporting         | [SECURITY.md](SECURITY.md)                                                       |

## 11. Change workflow

1. **Clarify scope** — read relevant spec under `docs/superpowers/` for behavior changes.
2. **Hooks** — ensure `make install-hooks` was run on this clone.
3. **Minimal implementation** — match existing naming (`camelCase` TS, Rust snake_case with serde camelCase).
4. **Tests** — add/update Vitest for TS logic; Rust tests for command/config changes.
5. **Verify** — `make all`. For tray/window/transparency changes, note manual macOS smoke test.
6. **Wrap up** — remove orphan symbols; do not commit unless asked.

### Branching

| Branch      | Role                                          |
| ----------- | --------------------------------------------- |
| `main`      | Production source of truth; release tags `v*` |
| `feature/*` | Feature branches; open PRs into `main`        |

Update [CHANGELOG.md](CHANGELOG.md) for user-facing changes.

## 12. Communication

- Default to **Chinese** when talking to the user.
- Cite code with `` `path:line` `` or fenced ```startLine:endLine:path blocks.
- Lead with the conclusion, then details; include verification commands when marking work done.
- Do not expand scope unilaterally — mention out-of-scope issues briefly.
