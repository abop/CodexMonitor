# Web/Desktop Feature Parity

This document describes the current capability split between the desktop app and the browser web build.

## Scope

- Desktop: the Tauri app on macOS, Linux, and Windows.
- Web: the browser build running with `VITE_CODEXMONITOR_RUNTIME=web` through the web bridge.
- Shared: available in both desktop and web.
- Desktop-only: no supported web path today.

## Shared Core Workflows

- Workspace list, connect, remove, and add by server path or Git URL.
- Thread list, start, resume, read, archive, rename, interrupt, approval responses, and request-user-input replies.
- Standard message sending with browser-picked or pasted image attachments.
- Core Git workflows: status, diffs, log, stage, unstage, revert, commit, fetch, pull, push, sync, branch list, branch create, and branch checkout.
- Prompt list, create, update, delete, and move.
- Models, collaboration modes, skills, apps, account info, and rate-limit reads.

## Desktop-Only Workflows

### Thread and Review Workflows

- Follow-up `Steer` sends.
- `/review` workflows, including working tree, branch, commit, detached review threads, and pull request review actions.
- Thread fork.
- Thread compact.
- MCP server status queries.

### Git and GitHub Workflows

- GitHub Issues and Pull Requests via `gh`.
- Pull request diff and comment fetch.
- Pull request checkout.
- Create GitHub repository from the app.
- Nested Git root discovery.
- AI-generated commit messages.

### Local Files, Editors, and Workspace Management

- Native workspace picker dialogs.
- Local workspace path validation.
- Clone-from-workspace flow.
- Worktree creation.
- Worktree setup status and setup-run tracking.
- Workspace file listing, file tree preview, and file snippet insertion.
- Workspace `AGENTS.md` editing.
- Global `AGENTS.md` editing.
- Global Codex config editing.
- Agent role management and agent config editing/generation.
- Prompt folder reveal.
- Open workspace paths in local editors or commands.
- Open file links in local editors or file managers.
- External app icon discovery.
- OS drag/drop of workspace folders.
- OS drag/drop of local image files into the composer. Web currently supports image picker and paste, but not local path drag/drop.

### Settings and Local System Integration

- Dictation model management and live dictation.
- Terminal sessions.
- Codex login and account switch flow.
- Codex doctor.
- Codex update.
- Experimental feature flag management.
- Tailscale status and mobile-access daemon controls.
- App update checks and install flow.
- Notification sounds.
- System notifications.
- App menu accelerators and native menu event integrations.
- Local usage snapshot on the home view.
- App build metadata.
- Mobile runtime detection.

### Desktop Shell and Window Chrome

- Native drag region.
- Desktop sidebar expand controls in shell chrome.
- Windows caption controls.
- Tray recent-thread sync.
- Tray usage sync.
- Native liquid-glass or window effect integrations.

## Web-Only Runtime Differences

- Web settings only surface `Projects`, `Display`, `Composer`, `Git`, and `About`.
- Hidden in web settings: `Environments`, `Dictation`, `Shortcuts`, `Open in`, `Server`, `Agents`, `Codex`, and `Features`.
- Web bridge selection lives in the sidebar rail and is web-only.
- Web realtime only subscribes to `app-server-event`. Terminal, dictation, updater, tray, and menu event channels remain desktop-only.

## Current Shared-UI Gaps

- The Composer still exposes the `Queue`/`Steer` preference, but only `Queue` has a working web transport path today.
- The sidebar account switcher can render in shared UI, but the login and switch flow still depends on desktop-only commands.
- Home usage data still depends on the desktop-only local usage snapshot command.

## Source of Truth

- Runtime RPC allowlist and desktop-only guards: `src/services/tauri.ts`
- Web realtime event surface: `src/services/events.ts`
- Web settings section filter: `src/features/settings/components/settingsViewConstants.ts`
- Desktop shell chrome gates: `src/features/app/components/MainAppShell.tsx`
- Workspace `AGENTS.md` web disablement: `src/features/workspaces/components/WorkspaceHome.tsx`
