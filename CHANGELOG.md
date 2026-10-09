# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Pet dragging and inertia use physical coordinates consistently on high-DPI displays, preventing the pet from drifting off-screen on Retina Macs.
- Restore saved pet positions inside the nearest available monitor work area on startup and when opening the pet from the tray or shortcut, including after a monitor is disconnected.

## [0.2.0] - 2026-09-03

### Fixed

- Windows: dragging the pet no longer shows a white square (manual move + skip HWND GDI fill; tao ignores background alpha)
- Windows: clicking the pet no longer restores a titled OS window (skip set_decorations/set_shadow; strip WS_CAPTION in DWM)
- Windows pet window title is empty so no "OctopPet" caption sits above the mascot
- Windows: zero pet non-client area (WM_NCCALCSIZE) so the empty white title strip is gone
- Windows: chat/settings rounded corners no longer flash a white HWND fill on click/focus
- Windows pet and chat/settings use DWM blur-behind (not extend-frame) so the mascot is not a white square
- Clicking the pet no longer flashes a white square over the mascot
- macOS close traffic light shows × on hover and a pressed state
- Clicking the pet again reopens chat beside the icon instead of restoring the last screen position
- Chat window height no longer snaps when starting a new conversation or sending the first message; resize stays bottom-anchored and eases over 360ms
- Model and connector menus stay inside the chat window and scroll instead of growing the OS window
- Queued follow-up turns no longer mark the finished reply as “连接意外断开”
- Saving settings now logs in and stores the token; testing connection also stores the password
- Chat can silently log in with the saved password when the access token is missing
- HTTP errors show the server message (e.g. “认证失败。”) instead of raw JSON
- Connection failures in chat offer a retry button
- Retrying an assistant turn reuses the original text, attachments, and model
- Settings leftover notices no longer linger on other tabs; shortcut hint and mascot labels are clearer
- Tray “检查更新” spacing and pet menu “与 Octop 对话” wording

### Added

- Desktop pet glides to a smooth stop after release and can be resized from its bottom-right hover handle (80–224 px)
- Model and agent popovers grow with the chat window so a tall window can show the full list
- Empty chat shows a gray logo in the message area
- Agent picker uses the same popover as the model list
- Setting to keep chat and settings visible when clicking another app (on by default)
- Settings tabs: 常规 (connection + mascot), 窗口, 快捷键, 关于
- `hooks/useChatController.ts`, `hooks/useWindowChrome.ts` — chat/settings window logic extracted from UI
- `lib/octopTypes.ts`, `lib/tauriWindowApi.ts`, `lib/chatHelpers.ts` — clearer module boundaries
- `components/ChatChrome.tsx`, `components/ChatResizeChrome.tsx`
- `styles/` split CSS (`base`, `pet`, `settings`, `chat`)
- `scripts/sync-version.mjs`, `scripts/extract-changelog.mjs`
- `npm run test:coverage` with baseline thresholds
- Composer unit tests; tray shortcut normalization Rust tests
- Release workflow: tag/version validation + CHANGELOG injection

### Changed

- Chat window starts at 400px and stays resizable; empty compact state fills the window instead of shrink-wrapping
- Sending a message no longer changes chat window height
- Narrow chat windows (~300px) keep the send button on-screen; toolbar chips shrink and wrap
- Debug builds store credentials in a local app-data file so macOS Keychain does not prompt on every rebuild
- Chat and settings close buttons follow the OS: traffic-light dot on the left on macOS, × on the right on Windows and Linux
- Settings window hides after a successful save
- `ChatWindow.tsx` slimmed to layout shell (~90 lines); logic in `useChatController`
- `SettingsWindow` uses shared auto-fit + Escape hooks; events via `tauriApi`
- Removed unused Tauri scaffold `App.tsx`; `index.html` title/icon → OctopPet
- `Composer` imports DTOs from `octopTypes` instead of `octopHttp`

### Removed

- Monolithic `App.css` content (replaced by `src/styles/*` imports)

## [0.1.0] - 2026-08-04

### Added

- Initial release: system tray, floating pet, compact chat, settings window
- Octop HTTP login, agent list, thread resume, WebSocket streaming chat
- OS keyring for password and access token
- Global shortcuts for open pet and open home
- macOS and Windows CI/release workflows

[Unreleased]: https://github.com/jubaoliang/OctopPet/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/jubaoliang/OctopPet/releases/tag/v0.2.0
[0.1.0]: https://github.com/jubaoliang/OctopPet/releases/tag/v0.1.0
