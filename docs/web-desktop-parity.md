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
- Thread follow-up controls: `Steer`, fork, compact, `/review` entrypoints, and MCP server status reads.
- Standard message sending with browser-picked or pasted image attachments.
- Core Git workflows: status, diffs, log, stage, unstage, revert, commit, fetch, pull, push, sync, branch list, branch create, and branch checkout.
- Workspace file listing, text preview, and file snippet insertion into the composer when the connected bridge advertises file-tree support.
- Workspace `AGENTS.md` preview and refresh in Workspace Home when the connected bridge advertises `files.workspaceAgents`, plus editing when it also advertises `files.workspaceAgentsWrite`.
- Global `AGENTS.md` preview and refresh in the web Codex settings section when the connected bridge advertises `files.globalAgents`, plus editing when it also advertises `files.globalAgentsWrite`.
- Global `config.toml` preview and refresh in the web Codex settings section when the connected bridge advertises `files.globalConfig`.
- Read-only remote `codexBin` / `codexArgs` runtime summary in the reduced web Codex settings section from shared app settings.
- Read-only `Agents` settings visibility for remote multi-agent core settings and configured custom agent summaries when the connected bridge advertises `operations.agentsSettings`.
- Prompt list, create, update, delete, and move.
- Models, collaboration modes, skills, apps, account info, rate-limit reads, and account login/switch when the connected bridge advertises `operations.accountLogin`.
- Home usage snapshot when the connected web bridge advertises `operations.usageSnapshot`.
- Codex doctor report in the reduced web Codex settings section when the connected bridge advertises `operations.doctorReport`.
- Read-only `Features` settings visibility when the connected web bridge advertises `operations.featureFlags`.
- Read-only `Environments` settings visibility for remote worktree roots and per-project setup scripts/worktrees folders.
- Read-only worktree setup status visibility in shared sidebar worktree cards when the connected bridge advertises `operations.worktreeSetupStatus`.

## Desktop-Only Workflows

### Thread and Review Workflows

- Pull request review discovery flows that depend on GitHub-specific PR listing, diff, comment, or checkout commands.

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
- Global Codex config editing. Web currently supports read-only preview and refresh only when `files.globalConfig` is available.
- Agent role management and agent config editing/generation. Web currently supports read-only settings summary only when `operations.agentsSettings` is available.
- Prompt folder reveal.
- Open workspace paths in local editors or commands.
- Open file links in local editors or file managers.
- External app icon discovery.
- OS drag/drop of workspace folders.
- OS drag/drop of local image files into the composer. Web currently supports image picker and paste, but not local path drag/drop.

### Settings and Local System Integration

- Dictation model management and live dictation.
- Terminal sessions.
- Custom-bin/custom-args Codex doctor. Web currently supports a read-only report using the server's current config only when `operations.doctorReport` is available.
- Codex update.
- Experimental feature flag management.
- Tailscale status and mobile-access daemon controls.
- App update checks and install flow.
- Notification sounds.
- System notifications.
- App menu accelerators and native menu event integrations.
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

- Web settings surface `Projects`, `Environments`, `Display`, `Composer`, `Git`, and `About` by default.
- `Environments` remains a reduced read-only view in web for inspecting the shared global worktrees root plus per-project worktree setup script and worktrees folder values.
- The `Agents` settings section appears in web only when the connected bridge advertises `operations.agentsSettings`, and it remains a reduced read-only view of core multi-agent settings and configured custom agent summaries.
- Hidden in web settings: `Dictation`, `Shortcuts`, `Open in`, and `Server`. `Agents`, `Codex`, and `Features` appear only when the connected bridge advertises the matching read-only capabilities.
- The `Codex` settings section appears in web only when the connected bridge advertises global file visibility or doctor-report visibility, and it remains a reduced read-only view for runtime summary, diagnostics, and files.
- The `Features` settings section appears in web only when the connected bridge advertises `operations.featureFlags`, and it remains a reduced read-only view of Codex-returned feature states.
- Worktree cards show read-only `Setup pending` / `Setup launched` status pills only when the connected bridge advertises `operations.worktreeSetupStatus`.
- Web bridge selection lives in the sidebar rail and is web-only.
- Web realtime only subscribes to `app-server-event`. Terminal, dictation, updater, tray, and menu event channels remain desktop-only.

## Current Shared-UI Gaps

- None currently.

## Source of Truth

- Runtime RPC wrapper routing and desktop-only guards: `src/services/tauri.ts`
- Bridge capability catalog: `src-tauri/src/shared/web_runtime_capabilities.rs`
- Web realtime event surface: `src/services/events.ts`
- Home usage orchestration and capability-aware empty state: `src/features/app/orchestration/useWorkspaceOrchestration.ts`, `src/features/home/components/HomeUsageSection.tsx`
- Account-switch capability gating and auth flow: `src/features/app/hooks/useWebRuntimeCapabilities.ts`, `src/features/app/hooks/useAccountSwitching.ts`, `src/features/app/components/Sidebar.tsx`
- Web settings section filter and read-only environment/agents/Codex visibility: `src/features/settings/components/settingsViewConstants.ts`, `src/features/settings/components/sections/SettingsEnvironmentsSection.tsx`, `src/features/settings/components/sections/SettingsAgentsSection.tsx`
- Worktree setup status capability and shared sidebar rendering: `src/features/app/hooks/useWorktreeSetupStatusMap.ts`, `src/features/app/components/WorktreeCard.tsx`, `src/features/app/components/Sidebar.tsx`
- Desktop shell chrome gates: `src/features/app/components/MainAppShell.tsx`
- Workspace `AGENTS.md` capability-aware read/write gating in Workspace Home: `src/features/workspaces/components/WorkspaceHome.tsx`, `src/features/workspaces/hooks/useWorkspaceAgentMd.ts`
- Global Codex file capability-aware web behavior: `src/features/settings/components/sections/SettingsCodexSection.tsx`, `src/features/settings/hooks/useSettingsCodexSection.ts`
- Web doctor-report routing: `src/services/tauri.ts`
