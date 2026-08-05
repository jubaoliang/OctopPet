# Contributing to Octop Pet

Thank you for your interest in contributing! **Octop Pet** is the desktop companion client for [Octop](https://github.com/TencentCloud/Octop) — a floating mascot, compact chat window, and system tray shell built with Tauri 2 and React.

## Getting started

**Prerequisites:** Node.js LTS, Rust (stable), [Tauri platform deps](https://tauri.app/start/prerequisites/)

You also need a reachable Octop instance for manual testing (`octop run --port 8088`).

```bash
git clone <your-repo-url> octop-pet
cd octop-pet
make install          # npm install
make install-hooks    # once per clone: pre-commit runs make all
make all              # vitest + tsc + cargo check/test (ship bar)
make dev              # npm run tauri dev
```

## Development workflow

| Command              | Description                                       |
| -------------------- | ------------------------------------------------- |
| `make install`       | Install frontend dependencies (`npm install`)     |
| `make install-hooks` | Point git at `.githooks` (pre-commit: `make all`) |
| `make dev`           | Start Tauri dev (`npm run tauri dev`)             |
| `make all`           | Ship bar: format + lint + typecheck + test        |
| `make check`         | CI gate: lint + typecheck + test (no auto-format) |
| `make format`        | `cargo fmt` + Prettier write                      |
| `make lint`          | fmt check + clippy + Prettier check + ESLint      |
| `make test`          | Vitest unit tests                                 |
| `make typecheck`     | `tsc --noEmit` + `cargo check`                    |
| `make cargo-test`    | Rust tests in `src-tauri/`                        |
| `make build`         | Production bundle (`npm run tauri build`)         |
| `make clean`         | Remove `dist/` and debug Rust artifacts           |

Pre-commit bypass (emergency only): `SKIP_PRECOMMIT=1 git commit …` or `git commit --no-verify`.

## Pull requests

1. Fork (if needed) and create a feature branch from **`main`**
2. Add or update tests for behavior changes — CI runs on **Ubuntu** (frontend + Rust)
3. Ensure `make install-hooks` is enabled locally; run **`make all`** before submitting
4. Update **`CHANGELOG.md`** when user-facing behavior changes
5. Open a PR with a clear description and test plan

See [AGENTS.md](AGENTS.md) for module boundaries and coding conventions. Security issues: [SECURITY.md](SECURITY.md).

## What to test manually

Octop Pet is a GUI app — automated CI cannot cover everything. Before merging UI or window changes, smoke-test on your platform:

- Tray menu: show pet, open home, settings, quit
- Pet: drag, click → chat, right-click menu, mascot switch
- Settings: test connection, save, global shortcut recorder
- Chat: login recovery, agent switch, thread resume, streaming send/stop, reconnect after Octop restart
- macOS: transparent pet window after chat focus (no gray box)

## Design docs

Implementation should follow specs under `docs/superpowers/`:

- [Desktop pet design](docs/superpowers/specs/2026-08-04-octop-desktop-pet-design.md)
- [Pet window UX](docs/superpowers/specs/2026-08-04-pet-window-ux-design.md)

Do **not** change Octop server APIs from this repo; open a separate PR in [Octop](https://github.com/TencentCloud/Octop) if the server contract needs to change.

## Releases

Version tags (`v*`) trigger [`.github/workflows/release.yml`](.github/workflows/release.yml). Keep in sync:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

---

# 贡献指南

感谢你对 Octop Pet 的关注！本项目是 [Octop](https://github.com/TencentCloud/Octop) 的桌面伴侣客户端，基于 Tauri 2 + React 构建。

## 环境搭建

**前置条件：** Node.js LTS、Rust stable、[Tauri 平台依赖](https://tauri.app/start/prerequisites/)

手动测试还需要可访问的 Octop 服务（`octop run --port 8088`）。

```bash
git clone <your-repo-url> octop-pet
cd octop-pet
make install
make install-hooks    # 每个 clone 执行一次
make all              # 发布门槛
make dev
```

## 常用命令

| 命令          | 说明                                               |
| ------------- | -------------------------------------------------- |
| `make all`    | format + lint + typecheck + test（提交前必须通过） |
| `make check`  | CI 门禁：lint + typecheck + test                   |
| `make format` | 自动格式化 Rust + 前端                             |
| `make lint`   | fmt 检查 + clippy + Prettier + ESLint              |

## 提交流程

1. 从 **`main`** 创建特性分支
2. 行为变更需补充测试 — CI 在 **Ubuntu** 上跑前端与 Rust 检查
3. 本地启用 `make install-hooks`；提交前 **`make all`** 必须通过
4. 用户可见变更时更新 **`CHANGELOG.md`**
5. 提交 Pull Request，附清晰说明与测试计划

模块边界与编码规范见 [AGENTS.md](AGENTS.md)。安全问题见 [SECURITY.md](SECURITY.md)。

## 手动测试清单

GUI 应用需在本机冒烟测试：

- 托盘：显示桌宠、打开主页、设置、退出
- 桌宠：拖动、单击开聊、右键菜单、切换形象
- 设置：测试连接、保存、快捷键录制
- 聊天：登录恢复、Agent 切换、线程恢复、流式发送/停止、Octop 重启后重连
- macOS：聊天聚焦后桌宠透明（无灰框）

## 设计文档

实现请参考 `docs/superpowers/` 下的规格说明。如需修改 Octop 服务端 API，请在 [Octop 仓库](https://github.com/TencentCloud/Octop) 单独提 PR，不要在本仓库改服务端契约。

## 发版

推送 `v*` tag 触发 GitHub Actions 构建。版本号需与 `package.json`、`tauri.conf.json`、`Cargo.toml` 保持一致。
