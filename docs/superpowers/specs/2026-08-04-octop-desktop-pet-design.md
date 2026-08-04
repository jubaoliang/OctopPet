# Octop Desktop Pet — Design Spec

**Date:** 2026-08-04  
**Status:** Draft for implementation  
**Repo:** `octop-pet` (standalone; talks to a remote Octop server)

## Goal

A desktop companion (similar in spirit to Codex’s desktop pet) that floats on the desktop as an animated Octop mascot. Clicking the pet opens a compact chat window against a remote Octop instance. A system tray menu covers character selection, opening the Octop dashboard home page, and settings.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Chat depth | **B** — Compact chat: message list + streaming + agent switcher; no workspace / file / browser docks |
| Code location | **B** — Independent repository (`octop-pet`) |
| Stack | **B** — Tauri 2 + React + TypeScript |
| Agent selection | **B** — Switchable in the chat window top bar |
| “Open home” | **A** — System browser → `{baseUrl}/` |
| Sessions | **B** — Remember last thread; reopen continues the conversation |
| Window model | **Approach 1** — Dual windows: pet window + chat window |

## Non-goals (v1)

- Attachments, tool-card UI, dock panels (workspace / files / browser)
- Multi-thread sidebar
- Auto-start on login
- Click-through pet window
- Shipping inside the Octop Python wheel / monorepo
- Changing Octop server contracts (if gaps appear, open a separate Octop PR)

## Architecture

```
octop-pet/
  src/                 # React UI (pet surface, chat window, settings)
  src-tauri/           # Rust: tray, multi-window, config, open browser
  assets/mascots/      # Animated webp copied from Octop dashboard public assets
  docs/superpowers/specs/
```

### Runtime roles

| Role | Responsibility |
|------|----------------|
| Tauri main process | System tray; create/manage windows; persist config; open system browser; credential storage helpers |
| Pet window | Frameless, transparent, always-on-top; show selected mascot webp; drag to move; click opens/focuses chat |
| Chat window | Compact chat UI; auth state; agent picker; message list; streaming; thread resume |
| Settings window | Dedicated small window: `baseUrl`, username, password; test connection; opened from tray |

### Remote Octop

- Login: `POST {baseUrl}/api/auth/login` with `{username, password}` → store `access_token`
- Subsequent HTTP/WS: `Authorization: Bearer <access_token>`
- Agents / threads / streaming: same APIs the Octop dashboard chat uses (HTTP list + chat WebSocket)
- Home: `open("{baseUrl}/")` via OS browser

Octop remains the source of truth for agents, threads, and model replies. The pet is a thin desktop client.

## Windows & tray

### Pet window

- On launch: frameless, transparent, always-on-top, ~120–160px
- Asset: animated **webp** (default `octop-mascot-peek.webp`; also `octop-mascot-type.webp`; more can be added under `assets/mascots/`)
- Drag: press-drag moves the window; position persisted and restored on next launch
- Single click: show or focus the chat window, anchored near the pet (prefer lower-right / upper-right of pet, clamp to screen work area)
- v1: **not** click-through (avoids accidental desktop clicks)

### Chat window

- Hidden by default; created on first pet click
- Layout: top bar (agent select + connection status) → message list → input
- Close = hide (app stays running via tray + pet)
- Reopen: resume last `thread_id` for the current agent when still valid
- Unauthenticated / invalid token: inline prompt + path to settings

### System tray

| Item | Behavior |
|------|----------|
| Show / hide pet | Toggle pet window visibility |
| Choose character | Submenu of bundled webp mascots; applies immediately |
| Open home | System browser → `{baseUrl}/` (require configured baseUrl) |
| Settings… | Open settings window/page |
| Quit | Exit process |

macOS: menu bar icon. Windows: notification area icon. Launch-at-login is out of scope for v1.

## Auth & chat data flow

### Config & login

1. User saves `baseUrl`, `username`, `password` in settings
2. “Test connection” or first chat action calls login
3. On success, persist `access_token` (and expiry if the API returns it)
4. On failure, surface a clear error in settings / chat
5. On HTTP 401: clear token; if password is stored, attempt **one** silent re-login; if that fails, open settings

### Agents & threads

1. After login, fetch agent list
2. Persist locally: `lastAgentId` plus a map `threadIdByAgent[agentId]`
3. Top-bar agent switch: update `lastAgentId`, then **resume that agent’s mapped thread** if present and still valid remotely; otherwise create a new thread and store its id. Never reuse another agent’s `thread_id`
4. Hide/show chat (same agent): reload history for the mapped `thread_id`; if remote returns not-found, create a new thread and update the map
5. Send → chat WS / existing streaming protocol → append user message, stream assistant tokens into the list

### Compact chat (v1)

**In scope:** plain Markdown rendering, streaming, stop generation if the remote API supports it, connecting / error states, agent switcher.

**Out of scope:** attachments, tool cards, docks, multi-session sidebar.

### Security

- Prefer OS secure storage for `password` and `access_token` (macOS Keychain / Windows Credential Manager)
- `baseUrl`, selected mascot, `lastAgentId`, and `threadIdByAgent` may live in normal app config
- Never log secrets; no third-party telemetry in v1

## Error handling

| Scenario | Behavior |
|----------|----------|
| Unreachable `baseUrl` | Error on “Test connection” and in chat |
| Bad credentials | Explicit auth error; no retry storm |
| Token expired / 401 | Clear token; one silent re-login; else settings |
| Stream drop | Keep partial reply; mark turn failed; allow resend |
| No agents | Top-bar hint; “Open home” to create agents in dashboard |
| Missing mascot file | Fall back to bundled default webp; local log |

## Packaging & platforms

- **Primary:** macOS (`.app` / `.dmg`). Architecture (arm64 / x64 / universal) decided at packaging time
- **Secondary:** Windows (`.msi` / `.exe`); keep platform APIs behind Tauri abstractions from day one
- App + tray icons derived from Octop brand assets

## Testing

- Unit: config read/write, auth state machine, thread resume helpers (mock HTTP/WS)
- Manual: tray menu, drag + always-on-top, dual-window placement, login → agent switch → resume thread, open home
- CI: lint + typecheck + unit tests; full GUI packaging is release/local, not a hard CI gate for every PR

## Repo boundary

- Independent git repo; no dependency on Octop source tree at runtime
- Mascot webp files are **copied** into this repo (not runtime-linked to Octop)
- Do not change Octop APIs for v1; document any missing endpoints as follow-ups

## Open implementation notes (non-blocking)

- Exact Octop chat WS message shapes: mirror the Octop dashboard chat client (`dashboard/src/pages/Chat/hooks/`) when implementing
- Token refresh: only as needed for 401 recovery; no speculative refresh loop

## Success criteria (v1)

1. Pet floats on macOS desktop with selectable webp mascots
2. Tray can change mascot, open remote dashboard home, open settings, quit
3. User can configure remote Octop URL + credentials and chat with streaming replies
4. Agent can be switched in the chat top bar; each agent’s last thread is resumed across hide/show and agent re-select
5. Windows build path is plausible (even if macOS ships first)
