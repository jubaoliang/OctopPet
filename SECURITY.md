# Security Policy

## Supported versions

| Version                  | Supported   |
| ------------------------ | ----------- |
| Latest release on `main` | ✅          |
| Older releases           | Best effort |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

- **GitHub Security Advisory:** open a private advisory on this repository (if enabled)
- **Email:** contact the maintainers listed in the repository

We aim to acknowledge reports within **3 business days** and provide a fix timeline within **7 business days** for confirmed issues.

## Scope

Octop Pet is a **desktop client** for a remote Octop server. Security responsibilities are split:

### Octop Pet (this repo)

- Passwords and access tokens are stored in the **OS keyring** (macOS Keychain / Windows Credential Manager), not in plain-text config files
- `config.json` holds non-secret settings only (`baseUrl`, username, mascot, thread map, window position, shortcuts)
- HTTP/WebSocket calls go to the user-configured Octop base URL — the app does not phone home to third parties
- Never commit `.env` files, signing certificates (`.p12`, `.pfx`), or captured tokens in issues or PRs

### Octop server (operator)

Operators remain responsible for:

- Securing network exposure of `octop run`
- Rotating JWT secrets and admin credentials
- Reviewing tool guard rules under `~/.octop/security/tool_guard/`
- Protecting LLM API keys and IM channel credentials

See [Octop configuration docs](https://github.com/TencentCloud/Octop/blob/main/docs/configuration.md) for server-side hardening.

## Client-side hardening notes

- Use **HTTPS** for remote Octop deployments when possible
- Do not share your Octop Pet machine account with untrusted users — keyring entries are scoped to the logged-in OS user
- After changing Octop password, use **Settings → Test connection → Save** to refresh stored credentials
