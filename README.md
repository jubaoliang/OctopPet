<p align="center">
  <img src="assets/octop-app-icon.png" alt="Octop Pet" width="128" />
</p>

<p align="center">
  <strong>A desktop companion for your self-hosted Octop — floating mascot, compact chat, system tray.</strong>
</p>

<p align="center">
  <a href="https://nodejs.org/"><img alt="Node.js LTS" src="https://img.shields.io/badge/node-LTS-green?logo=node.js&logoColor=white" /></a>
  <a href="https://www.rust-lang.org/"><img alt="Rust stable" src="https://img.shields.io/badge/rust-stable-orange?logo=rust&logoColor=white" /></a>
  <a href="https://tauri.app/"><img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-blue?logo=tauri&logoColor=white" /></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green" /></a>
</p>

<p align="center">
  <a href="#-highlights">Highlights</a> ·
  <a href="#-overview">Overview</a> ·
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-usage">Usage</a> ·
  <a href="#-development">Development</a> ·
  <a href="#-contents">Contents</a>
</p>

<p align="center">
  <b>English</b> · <a href="README_CN.md">中文</a>
</p>

---

**Octop Pet** is a lightweight desktop client for a remote [Octop](https://github.com/TencentCloud/Octop) instance. It lives in the system tray, shows an always-on-top animated mascot on your desktop, and opens a compact chat window for streaming conversations with your agents.

Octop remains the source of truth for agents, threads, and model replies. Octop Pet is a thin Tauri shell: HTTP login, agent list, thread resume, and WebSocket streaming against the same APIs the Octop dashboard uses.

## ✨ Highlights

|     | Feature                | Description                                                                        |
| --- | ---------------------- | ---------------------------------------------------------------------------------- |
| 🐾  | **Floating mascot**    | Frameless, transparent, always-on-top pet window with selectable animated mascots  |
| 💬  | **Compact chat**       | Streaming replies, agent switcher, message queue, Markdown rendering               |
| 🔔  | **System tray**        | Show/hide pet, open Octop home, settings, global shortcuts, quit                   |
| 🔒  | **Secure credentials** | Password and access token stored in the OS keyring (Keychain / Credential Manager) |
| 🔄  | **Thread resume**      | Remembers the last thread per agent across hide/show and agent switches            |
| 🌐  | **Remote-first**       | Connects to any reachable Octop deployment — local, LAN, or cloud                  |

## 📌 Overview

Octop Pet runs as a background tray application with two primary surfaces:

1. **Pet window** — drag to move, click to open chat, right-click for a context menu
2. **Chat window** — compact conversation UI; close hides the window without quitting the app

Settings hold the Octop base URL, username, and password. After a successful login, the app fetches agents, resumes the last thread, and streams assistant replies over WebSocket.

If the Octop service is temporarily unreachable, the chat window retries connection the next time you open it — no need to restart the app.

## 🚀 Quick Start

### Prerequisites

1. A running **Octop** instance (see [Octop Quick Start](https://github.com/TencentCloud/Octop#-quick-start))
2. **Node.js** LTS from [nodejs.org](https://nodejs.org/)
3. **Rust** via [rustup](https://rustup.rs/)
4. **Tauri platform dependencies** — [Tauri prerequisites](https://tauri.app/start/prerequisites/) (on macOS: Xcode Command Line Tools)

Restart your terminal after installing Rust, then verify:

```sh
node -v && npm -v && rustc --version && cargo --version
```

### 1. Install and run

```sh
git clone <your-repo-url> octop-pet
cd octop-pet
make install          # npm install
make install-hooks    # once per clone — enables pre-commit quality gate
make dev              # npm run tauri dev
```

Or without Make:

```sh
npm install
npm run tauri dev
```

Octop Pet starts in the system tray. Click the tray icon and choose **设置…** (Settings).

### 2. Start Octop (if not already running)

In a separate terminal, start your Octop server:

```sh
octop run --host 127.0.0.1 --port 8088
```

Open **http://127.0.0.1:8088** and create at least one agent if you have none yet.

### 3. Connect Octop Pet

In **Settings**:

1. Enter the Octop **base URL**, e.g. `http://127.0.0.1:8088` or `https://octop.example.com`
2. Enter your Octop **username** and **password**
3. Click **测试连接** (Test connection) to verify credentials
4. Click **保存** (Save)

The service URL and username are stored in app config; passwords and access tokens use the OS keyring.

### 4. Chat

- **Click the pet** or use the tray / global shortcut to open chat
- Pick an agent in the top bar; each agent remembers its last thread
- Send messages, queue follow-ups while streaming, attach files, pick models and MCP connectors

## 📖 Usage

### System tray

| Item              | Action                                  |
| ----------------- | --------------------------------------- |
| Show pet / chat   | Show the mascot and open chat           |
| Open home         | Open `{baseUrl}/` in the system browser |
| Settings…         | Open the settings window                |
| Check for updates | Show current version info               |
| Quit              | Exit the application                    |

### Global shortcuts (configurable in Settings)

| Default             | Action                     |
| ------------------- | -------------------------- |
| `CmdOrCtrl+Shift+O` | Show pet and open chat     |
| `CmdOrCtrl+Shift+H` | Open Octop home in browser |

### Pet window

- **Drag** to reposition (position is saved)
- **Click** to show or focus chat
- **Right-click** for mascot, home, settings, quit

### Chat window

- **Close dot** hides the window; the app keeps running
- **New session** creates a fresh thread for the current agent
- **Agent switch** resumes that agent's mapped thread when still valid

## 🧠 Core Technology

| Layer         | Technology                                               |
| ------------- | -------------------------------------------------------- |
| Desktop shell | Tauri 2 (Rust)                                           |
| UI            | React 19 + TypeScript + Vite                             |
| HTTP client   | `@tauri-apps/plugin-http`                                |
| Config        | `@tauri-apps/plugin-store` (JSON)                        |
| Secrets       | OS keyring via Rust commands                             |
| Tests         | Vitest + Testing Library (frontend), `cargo test` (Rust) |

### Remote Octop APIs used

| Purpose             | Endpoint                                          |
| ------------------- | ------------------------------------------------- |
| Login               | `POST /api/auth/login`                            |
| List agents         | `GET /api/agents`                                 |
| Create thread       | `POST /api/agents/{id}/threads`                   |
| History             | `GET /api/agents/{id}/threads/{threadId}/history` |
| Streaming chat      | `WS /api/agents/{id}/chat/ws?token=…`             |
| Models / connectors | Dashboard-compatible list endpoints               |

See [Octop API docs](https://github.com/TencentCloud/Octop/blob/main/docs/api.md) for the full server reference.

## 🏗️ Architecture

```
octop-pet/
  src/                 React UI — pet, chat, settings windows (one SPA, routed by window label)
  src-tauri/           Rust — tray, multi-window, config, keyring, global shortcuts
  assets/              App icon and mascot assets
  docs/superpowers/    Design specs and implementation plans
```

```
Tauri main process
 ├─ Tray + global shortcuts
 ├─ Pet window      frameless mascot, drag, click → chat
 ├─ Chat window     compact chat, streaming, agent picker
 └─ Settings window baseUrl / credentials / hotkeys / mascot
        │
        ▼ HTTP + WebSocket
   Remote Octop server
```

Design spec: [docs/superpowers/specs/2026-08-04-octop-desktop-pet-design.md](docs/superpowers/specs/2026-08-04-octop-desktop-pet-design.md)

## 🛠️ Development

### Quality gate (ship bar)

Also enforced by the pre-commit hook after `make install-hooks`:

```sh
make all              # format + lint + typecheck + test (ship bar)
make check            # lint + typecheck + test (CI, no auto-format)
make format           # cargo fmt + prettier --write
make lint             # fmt check + clippy + prettier check + eslint
```

Individual targets:

```sh
make test             # vitest + cargo test
make typecheck        # tsc + cargo check
make build            # production bundle (npm run tauri build)
```

Bypass pre-commit (emergency only): `SKIP_PRECOMMIT=1 git commit …` or `git commit --no-verify`.

### Project layout

```
src/
  windows/             PetWindow, ChatWindow, SettingsWindow
  components/          Composer, MessageList, AgentSelect, …
  lib/                 octopHttp, chatStream, configLogic, tauriApi, …
src-tauri/src/
  tray.rs              System tray menu and shortcuts
  window_cmd.rs        Window show/hide/placement
  config_cmd.rs        JSON config load/save/patch
  secrets_cmd.rs       OS keyring helpers
```

## 📦 Release

Push a version tag to trigger [`.github/workflows/release.yml`](.github/workflows/release.yml). Keep versions in sync:

```sh
make sync-version VERSION=0.2.0
```

This updates `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.

```sh
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

CI builds **macOS** (Apple Silicon + Intel) and **Windows** (x64 + ARM64), runs tests first, then uploads installers to GitHub Releases.

Local build output: `src-tauri/target/release/bundle/`.

## 🖥️ Platform notes

### macOS

The pet window uses a transparent, borderless, always-on-top window with Tauri macOS private API support. Intended for direct distribution, not the Mac App Store. If macOS requests Accessibility permission while interacting with the pet, grant it under **System Settings → Privacy & Security → Accessibility**.

### Windows

Windows builds are produced in CI (x64 and ARM64). Transparent-window behavior is less verified than on macOS — please report issues.

## 📑 Contents

- [Highlights](#-highlights)
- [Overview](#-overview)
- [Quick Start](#-quick-start)
- [Usage](#-usage)
- [Core Technology](#-core-technology)
- [Architecture](#-architecture)
- [Development](#-development)
- [Release](#-release)
- [Platform notes](#-platform-notes)
- [Contributing](#-contributing)
- [Related projects](#-related-projects)
- [License](#-license)

## 🤝 Contributing

Contributions are welcome:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run `make install-hooks` once, then `make all` before submitting
4. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. Module boundaries for AI agents: [AGENTS.md](AGENTS.md). Security: [SECURITY.md](SECURITY.md).

## 🔗 Related projects

| Project                                        | Description                                               |
| ---------------------------------------------- | --------------------------------------------------------- |
| [Octop](https://github.com/TencentCloud/Octop) | Self-hosted multi-user, multi-agent AI assistant platform |
| [Tauri](https://tauri.app/)                    | Cross-platform desktop app framework                      |

## 📄 License

This project is licensed under the [MIT License](LICENSE).
