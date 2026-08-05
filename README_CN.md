<p align="center">
  <img src="assets/octop-app-icon.png" alt="Octop Pet" width="128" />
</p>

<p align="center">
  <strong>自托管 Octop 的桌面伴侣 — 悬浮桌宠、紧凑聊天、系统托盘常驻。</strong>
</p>

<p align="center">
  <a href="https://nodejs.org/"><img alt="Node.js LTS" src="https://img.shields.io/badge/node-LTS-green?logo=node.js&logoColor=white" /></a>
  <a href="https://www.rust-lang.org/"><img alt="Rust stable" src="https://img.shields.io/badge/rust-stable-orange?logo=rust&logoColor=white" /></a>
  <a href="https://tauri.app/"><img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-blue?logo=tauri&logoColor=white" /></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green" /></a>
</p>

<p align="center">
  <a href="#-概述">概述</a> ·
  <a href="#-亮点">亮点</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-使用说明">使用说明</a> ·
  <a href="#-开发">开发</a> ·
  <a href="#-目录">目录</a>
</p>

<p align="center">
  <a href="README.md">English</a> · <b>中文</b>
</p>

---

## 📌 概述

**Octop Pet** 是远程 [Octop](https://github.com/TencentCloud/Octop) 实例的轻量桌面客户端。它在系统托盘常驻，在桌面显示始终置顶的动画桌宠，并提供一个紧凑的聊天窗口，与 Agent 进行流式对话。

Octop 仍是 Agent、会话线程与模型回复的唯一数据源。Octop Pet 是薄客户端：通过 HTTP 登录、拉取 Agent 列表、恢复线程，并使用与 Octop 控制台相同的 WebSocket 协议进行流式聊天。

## ✨ 亮点

|     | 特性         | 说明                                                          |
| --- | ------------ | ------------------------------------------------------------- |
| 🐾  | **悬浮桌宠** | 无边框透明窗口，可选动画形象，可拖动定位                      |
| 💬  | **紧凑聊天** | 流式回复、Agent 切换、消息排队、Markdown 渲染                 |
| 🔔  | **系统托盘** | 显示/隐藏桌宠、打开 Octop 主页、设置、全局快捷键、退出        |
| 🔒  | **凭据安全** | 密码与访问令牌存入系统钥匙串（Keychain / Credential Manager） |
| 🔄  | **会话恢复** | 每个 Agent 记住上次线程，隐藏/显示与切换 Agent 后自动恢复     |
| 🌐  | **远程连接** | 连接任意可访问的 Octop 部署 — 本机、局域网或云端              |

## 🚀 快速开始

### 环境要求

1. 已运行的 **Octop** 服务（见 [Octop 快速开始](https://github.com/TencentCloud/Octop/blob/main/README_CN.md#-快速开始)）
2. **Node.js** LTS — [nodejs.org](https://nodejs.org/)
3. **Rust** — [rustup](https://rustup.rs/)
4. **Tauri 平台依赖** — [Tauri 前置条件](https://tauri.app/start/prerequisites/)（macOS 需 Xcode Command Line Tools）

安装 Rust 后请重启终端，并确认：

```sh
node -v && npm -v && rustc --version && cargo --version
```

### 1. 安装并运行

```sh
git clone <your-repo-url> octop-pet
cd octop-pet
make install          # npm install
make install-hooks    # 每个 clone 执行一次 — 启用提交前质量检查
make dev              # npm run tauri dev
```

Octop Pet 启动后出现在系统托盘。点击托盘图标，选择 **设置…**。

### 2. 启动 Octop（若尚未运行）

在另一个终端启动 Octop：

```sh
octop run --host 127.0.0.1 --port 8088
```

打开 **http://127.0.0.1:8088**，若尚无 Agent，请先在控制台创建一个。

### 3. 连接 Octop Pet

在 **设置** 中：

1. 填写 Octop **服务地址**，如 `http://127.0.0.1:8088` 或 `https://octop.example.com`
2. 填写 **用户名** 与 **密码**
3. 点击 **测试连接** 验证凭据
4. 点击 **保存**

服务地址与用户名保存在应用配置中；密码与访问令牌通过系统钥匙串存储。

### 4. 开始聊天

- **点击桌宠** 或使用托盘 / 全局快捷键打开聊天
- 在顶部栏切换 Agent；每个 Agent 会恢复上次的会话线程
- 支持流式发送、排队追问、附件上传、模型与 MCP 连接器选择

若 Octop 服务暂时不可用，聊天窗口会在**下次打开时自动重试连接**，无需重启应用。

## 📖 使用说明

### 系统托盘

| 菜单项          | 行为                            |
| --------------- | ------------------------------- |
| 显示桌宠 / 聊天 | 显示 mascot 并打开聊天窗口      |
| 打开主页        | 在系统浏览器中打开 `{baseUrl}/` |
| 设置…           | 打开设置窗口                    |
| 检查更新        | 显示当前版本信息                |
| 退出            | 退出应用                        |

### 全局快捷键（可在设置中修改）

| 默认快捷键          | 行为                      |
| ------------------- | ------------------------- |
| `CmdOrCtrl+Shift+O` | 显示桌宠并打开聊天        |
| `CmdOrCtrl+Shift+H` | 在浏览器中打开 Octop 主页 |

### 桌宠窗口

- **拖动** 移动位置（会自动保存）
- **单击** 显示或聚焦聊天窗口
- **右键** 打开菜单：切换形象、主页、设置、退出

### 聊天窗口

- **关闭圆点** 仅隐藏窗口，应用继续在托盘运行
- **新建会话** 为当前 Agent 创建新线程
- **切换 Agent** 恢复该 Agent 已映射的线程（若远程仍有效）

## 🧠 核心技术

| 层级   | 技术                                                   |
| ------ | ------------------------------------------------------ |
| 桌面壳 | Tauri 2（Rust）                                        |
| UI     | React 19 + TypeScript + Vite                           |
| HTTP   | `@tauri-apps/plugin-http`                              |
| 配置   | `@tauri-apps/plugin-store`（JSON）                     |
| 密钥   | Rust 命令 + OS 钥匙串                                  |
| 测试   | Vitest + Testing Library（前端）、`cargo test`（Rust） |

### 使用的 Octop API

| 用途       | 端点                                              |
| ---------- | ------------------------------------------------- |
| 登录       | `POST /api/auth/login`                            |
| Agent 列表 | `GET /api/agents`                                 |
| 创建线程   | `POST /api/agents/{id}/threads`                   |
| 历史消息   | `GET /api/agents/{id}/threads/{threadId}/history` |
| 流式聊天   | `WS /api/agents/{id}/chat/ws?token=…`             |

完整服务端 API 见 [Octop docs/api.md](https://github.com/TencentCloud/Octop/blob/main/docs/api.md)。

## 🏗️ 架构

```
octop-pet/
  src/                 React UI — 桌宠、聊天、设置（单 SPA，按窗口 label 路由）
  src-tauri/           Rust — 托盘、多窗口、配置、钥匙串、全局快捷键
  assets/              应用图标与 mascot 资源
  docs/superpowers/    设计规格与实现计划
```

设计文档：[docs/superpowers/specs/2026-08-04-octop-desktop-pet-design.md](docs/superpowers/specs/2026-08-04-octop-desktop-pet-design.md)

## 🛠️ 开发

### 质量门禁（ship bar）

`make install-hooks` 后，提交前会自动执行：

```sh
make all              # format + lint + typecheck + test（发布门槛）
make check            # lint + typecheck + test（CI，不自动 format）
make format           # cargo fmt + prettier --write
make lint             # fmt 检查 + clippy + prettier + eslint
```

单独执行：

```sh
make test             # vitest + cargo test
make typecheck        # tsc + cargo check
make build            # 生产构建
```

紧急跳过 pre-commit：`SKIP_PRECOMMIT=1 git commit …` 或 `git commit --no-verify`。

### 项目结构

```
src/
  windows/             PetWindow、ChatWindow、SettingsWindow
  components/          Composer、MessageList、AgentSelect 等
  lib/                 octopHttp、chatStream、configLogic、tauriApi 等
src-tauri/src/
  tray.rs              系统托盘与快捷键
  window_cmd.rs        窗口显示/隐藏/定位
  config_cmd.rs        JSON 配置读写
  secrets_cmd.rs       钥匙串封装
```

## 📦 发版

推送版本 tag 触发 [`.github/workflows/release.yml`](.github/workflows/release.yml)。以下版本号需保持一致：

- `src-tauri/tauri.conf.json` → `"version"`
- `package.json` → `"version"`
- `src-tauri/Cargo.toml` → `version`

```sh
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

CI 在 **macOS**（Apple Silicon + Intel）与 **Windows**（x64 + ARM64）上构建安装包。

本地构建产物：`src-tauri/target/release/bundle/`。

## 🖥️ 平台说明

### macOS

桌宠使用透明无边框、始终置顶窗口，并启用 Tauri macOS 私有 API。适用于直接分发，非 Mac App Store。若系统请求「辅助功能」权限，请在 **系统设置 → 隐私与安全性 → 辅助功能** 中授权。

### Windows

Windows 构建由 CI 产出（x64 与 ARM64）。透明窗口行为在 Windows 上验证较少，欢迎反馈问题。

## 📑 目录

- [概述](#-概述)
- [亮点](#-亮点)
- [快速开始](#-快速开始)
- [使用说明](#-使用说明)
- [核心技术](#-核心技术)
- [架构](#-架构)
- [开发](#-开发)
- [发版](#-发版)
- [平台说明](#-平台说明)
- [参与贡献](#-参与贡献)
- [相关项目](#-相关项目)
- [许可证](#-许可证)

## 🤝 参与贡献

欢迎贡献：

1. Fork 本仓库
2. 创建功能分支（`git checkout -b feature/amazing-feature`）
3. 每个 clone 执行一次 `make install-hooks`，提交前运行 `make all`
4. 发起 Pull Request

完整指南见 [CONTRIBUTING.md](CONTRIBUTING.md)。AI 编码代理导航见 [AGENTS.md](AGENTS.md)。安全问题见 [SECURITY.md](SECURITY.md)。

## 🔗 相关项目

| 项目                                           | 描述                               |
| ---------------------------------------------- | ---------------------------------- |
| [Octop](https://github.com/TencentCloud/Octop) | 自托管多用户、多 Agent AI 助手平台 |
| [Tauri](https://tauri.app/)                    | 跨平台桌面应用框架                 |

## 📄 许可证

本项目采用 [MIT License](LICENSE)。
