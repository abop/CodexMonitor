# Web Parity Global AGENTS Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable web runtime to edit global `AGENTS.md` through a narrow, capability-gated write path in the reduced Codex settings section.

**Architecture:** Add a dedicated `write_global_agents_md` backend/RPC path, advertise `files.globalAgentsWrite`, route `writeGlobalAgentsMd()` through `invokeSupportedRpc()`, and keep the reduced web Codex section partially writable only for the global AGENTS editor while leaving `config.toml` read-only.

**Tech Stack:** Rust, Tauri commands, Axum bridge, React, TypeScript, Vitest.

---

## Scope Split

This plan covers a single remote-safe write slice from `docs/superpowers/specs/2026-04-22-web-parity-global-agents-write-design.md`.

Included:

- dedicated global `AGENTS.md` write RPC and bridge forwarding
- explicit global AGENTS read/write capability split
- reduced web Codex section save enablement for global AGENTS only
- live parity doc update

Excluded:

- global `config.toml` write support
- generic `file_write` in web
- environment or agents-settings writes
- worktree lifecycle writes
- Codex update or feature mutation work

## File Structure

Modify:

- `src-tauri/src/files/mod.rs` - add narrow `write_global_agents_md` command and remote routing.
- `src-tauri/src/bin/codex_monitor_daemon.rs` - expose a dedicated daemon method backed by `file_write_core()`.
- `src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs` - route `write_global_agents_md`.
- `src-tauri/src/lib.rs` - register the new Tauri command.
- `src-tauri/src/remote_backend/mod.rs` - mark the new RPC retry-safe.
- `src-tauri/src/shared/workspace_rpc.rs` - add the shared request payload struct.
- `src-tauri/src/shared/web_runtime_capabilities.rs` - advertise `files.globalAgentsWrite` and allow the narrow RPC.
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` - cover capability payloads and forwarding.
- `src/services/bridge/http.ts` - extend capability validation for `globalAgentsWrite`.
- `src/features/app/hooks/useWebRuntimeCapabilities.ts` - add desktop/web defaults for the new capability.
- `src/services/tauri.ts` - route `writeGlobalAgentsMd()` through `invokeSupportedRpc("write_global_agents_md", ...)`.
- `src/features/settings/hooks/useSettingsViewOrchestration.ts` - thread global AGENTS write capability into reduced Codex section state.
- `src/features/settings/hooks/useSettingsCodexSection.ts` - split global AGENTS read-only behavior from global config read-only behavior.
- `src/features/settings/components/sections/SettingsCodexSection.tsx` - allow only the global AGENTS card to become editable in reduced web mode.
- `docs/web-desktop-parity.md` - update the live parity statement.

Tests:

- `src/services/bridge/http.test.ts`
- `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx`
- `src/services/tauri.test.ts`
- `src/features/settings/components/SettingsView.test.tsx`
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`

## Task 1: Add Failing Capability, Bridge, And Service Tests

**Files:**

- Modify: `src/services/bridge/http.test.ts`
- Modify: `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx`
- Modify: `src/services/tauri.test.ts`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`

- [ ] **Step 1: Write failing tests for the new capability shape**

Add assertions that:

- `files.globalAgentsWrite` is required in bridge capability payload validation
- desktop defaults expose it as `true`
- safe web fallback exposes it as `false`

- [ ] **Step 2: Write failing bridge tests for the new method**

Add assertions that:

- `/api/capabilities` includes `write_global_agents_md`
- `/api/rpc` forwards `write_global_agents_md`

- [ ] **Step 3: Write failing service tests**

Add assertions that `writeGlobalAgentsMd("# Global")` calls:

```ts
invoke("write_global_agents_md", {
  content: "# Global",
});
```

- [ ] **Step 4: Run targeted tests and verify red**

Run:

```bash
npm run test -- src/services/bridge/http.test.ts src/features/app/hooks/useWebRuntimeCapabilities.test.tsx src/services/tauri.test.ts
cd src-tauri && cargo test --bin codex_monitor_web_bridge global_agents
```

Expected: new assertions fail because the capability and method are not implemented yet.

## Task 2: Add The Narrow Backend And Frontend Routing

**Files:**

- Modify: `src-tauri/src/files/mod.rs`
- Modify: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Modify: `src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/remote_backend/mod.rs`
- Modify: `src-tauri/src/shared/workspace_rpc.rs`
- Modify: `src-tauri/src/shared/web_runtime_capabilities.rs`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- Modify: `src/services/bridge/http.ts`
- Modify: `src/features/app/hooks/useWebRuntimeCapabilities.ts`
- Modify: `src/services/tauri.ts`

- [ ] **Step 1: Implement the dedicated backend command**

Add `write_global_agents_md` so it:

- routes remotely via `write_global_agents_md`
- writes locally with `file_write_core(..., FileScope::Global, FileKind::Agents, None, content)`

- [ ] **Step 2: Implement the capability split**

Extend Rust and TypeScript capability payloads with:

```ts
files: {
  workspaceTree: boolean;
  workspaceAgents: boolean;
  workspaceAgentsWrite: boolean;
  globalAgents: boolean;
  globalAgentsWrite: boolean;
  globalConfig: boolean;
}
```

Set desktop default to `true` and safe web fallback to `false`.

- [ ] **Step 3: Route the frontend save helper**

Update `writeGlobalAgentsMd()` to call:

```ts
return invokeSupportedRpc("write_global_agents_md", {
  content,
});
```

- [ ] **Step 4: Re-run targeted routing tests**

Run:

```bash
npm run test -- src/services/bridge/http.test.ts src/features/app/hooks/useWebRuntimeCapabilities.test.tsx src/services/tauri.test.ts
cd src-tauri && cargo test --bin codex_monitor_web_bridge global_agents
```

Expected: capability and bridge/service tests pass.

## Task 3: Enable Global AGENTS Save In Reduced Web Codex Settings

**Files:**

- Modify: `src/features/settings/hooks/useSettingsViewOrchestration.ts`
- Modify: `src/features/settings/hooks/useSettingsCodexSection.ts`
- Modify: `src/features/settings/components/sections/SettingsCodexSection.tsx`
- Modify: `src/features/settings/components/SettingsView.test.tsx`

- [ ] **Step 1: Write failing reduced-section tests**

Add a SettingsView test that asserts:

- reduced web Codex still shows read-only global `config.toml`
- global AGENTS becomes editable and save-enabled when `files.globalAgentsWrite` is present

- [ ] **Step 2: Implement capability-aware reduced section behavior**

Thread `globalAgentsWrite` into the Codex settings orchestration and set:

- `globalAgentsReadOnly` to `true` only when reduced web mode is active and write support is absent
- `globalAgentsSaveDisabled` to the normal editor-disabled state when write is supported
- `globalConfigReadOnly` unchanged

- [ ] **Step 3: Update reduced web Codex rendering**

Make the reduced section use the actual global AGENTS read-only/save-disabled props instead of hardcoding the card to read-only with disabled save.

- [ ] **Step 4: Re-run targeted UI tests**

Run:

```bash
npm run test -- src/features/settings/components/SettingsView.test.tsx
```

Expected: reduced web Codex coverage passes.

## Task 4: Update Docs And Run Full Verification

**Files:**

- Modify: `docs/web-desktop-parity.md`

- [ ] **Step 1: Update the live parity doc**

Document that global `AGENTS.md` is editable in web runtime only when the bridge advertises `files.globalAgentsWrite`, while global `config.toml` remains read-only.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run test
npm run typecheck
cd src-tauri && cargo check
cd src-tauri && cargo test --bin codex_monitor_web_bridge
git diff --check
```

Expected: all commands pass.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-04-22-web-parity-global-agents-write-design.md \
  docs/superpowers/plans/2026-04-22-web-parity-global-agents-write.md \
  docs/web-desktop-parity.md \
  src-tauri/src/shared/workspace_rpc.rs \
  src-tauri/src/files/mod.rs \
  src-tauri/src/bin/codex_monitor_daemon.rs \
  src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/remote_backend/mod.rs \
  src-tauri/src/shared/web_runtime_capabilities.rs \
  src-tauri/src/bin/codex_monitor_web_bridge/routes.rs \
  src/services/bridge/http.ts \
  src/features/app/hooks/useWebRuntimeCapabilities.ts \
  src/services/tauri.ts \
  src/features/settings/hooks/useSettingsViewOrchestration.ts \
  src/features/settings/hooks/useSettingsCodexSection.ts \
  src/features/settings/components/sections/SettingsCodexSection.tsx \
  src/features/settings/components/SettingsView.test.tsx
git commit -m "feat: enable web global agents editing"
```

Expected: one clean commit containing the narrow global `AGENTS.md` web write slice.
