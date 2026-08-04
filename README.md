# Octop Pet

Octop Pet is a small desktop companion for a remote Octop instance. It lives in
the system tray, provides a floating mascot, and opens a compact chat window.
The desktop shell uses Tauri 2; the UI uses React and TypeScript.

## Prerequisites

1. Install a current Node.js LTS release from [nodejs.org](https://nodejs.org/).
2. Install Rust with [rustup](https://rustup.rs/).
3. Install the platform dependencies from the
   [Tauri prerequisites guide](https://tauri.app/start/prerequisites/).
   On macOS this includes the Xcode command-line tools.

Restart your terminal after installing Rust, then verify that `node`, `npm`,
`rustc`, and `cargo` are available.

## Install and run

```sh
npm install
npm run tauri dev
```

Octop Pet starts as a tray application. Click the Octop Pet tray icon and choose
**设置…** (Settings) to open Settings.

## Connect to Octop

In Settings:

1. Enter the base URL of the remote Octop service, such as
   `https://octop.example.com`.
2. Enter the Octop username and password.
3. Choose **测试连接** (Test connection) to verify the credentials.
4. Choose **保存** (Save) to keep the configuration.

The service URL and username are stored in the app configuration; passwords and
access tokens are stored through the operating system keyring.

## Verify and build

Ensure `cargo` is on your `PATH` (`source $HOME/.cargo/env` if needed), then run:

```sh
npm test
npx tsc --noEmit
(cd src-tauri && cargo check)
npm run tauri build
```

Local macOS builds are unsigned development artifacts unless signing credentials
are configured. They are suitable for local smoke testing, but distribution
requires Apple code signing and notarization.

## Platform notes

### macOS

The floating pet uses a transparent, borderless, always-on-top window and
enables Tauri's macOS private API support. This is intended for direct desktop
distribution rather than the Mac App Store. If macOS asks for Accessibility
permission while interacting with the floating window, grant it in **System
Settings → Privacy & Security → Accessibility**.

### Windows

Windows support is planned later. The configuration includes Windows-plausible
window and icon settings, but this release is developed and smoke-tested on
macOS only; Windows packaging and transparent-window behavior are not yet
verified.
