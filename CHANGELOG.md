# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `hooks/useChatController.ts`, `hooks/useWindowChrome.ts` — chat/settings window logic extracted from UI
- `lib/octopTypes.ts`, `lib/tauriWindowApi.ts`, `lib/chatHelpers.ts` — clearer module boundaries
- `components/ChatChrome.tsx`, `components/ChatResizeChrome.tsx`
- `styles/` split CSS (`base`, `pet`, `settings`, `chat`)
- `scripts/sync-version.mjs`, `scripts/extract-changelog.mjs`
- `npm run test:coverage` with baseline thresholds
- Composer unit tests; tray shortcut normalization Rust tests
- Release workflow: tag/version validation + CHANGELOG injection

### Changed

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

[Unreleased]: https://github.com/TencentCloud/octop-pet/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/TencentCloud/octop-pet/releases/tag/v0.1.0
