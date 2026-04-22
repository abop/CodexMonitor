# Web Parity Workspace AGENTS Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable web runtime to edit workspace `AGENTS.md` through a narrow, capability-gated write path.

**Architecture:** Add a dedicated `write_workspace_agent_md` backend/RPC path, advertise a separate `files.workspaceAgentsWrite` capability, route the frontend save helper through `invokeSupportedRpc()`, and keep Workspace Home editable in web only when both read and write support are present.

**Tech Stack:** Rust, Tauri commands, Axum bridge, React, TypeScript, Vitest.

---

## Scope Split

This plan covers a single remote-safe write slice from `docs/superpowers/specs/2026-04-22-web-parity-workspace-agents-write-design.md`.

Included:

- dedicated workspace `AGENTS.md` write RPC and bridge forwarding
- explicit web capability split between read and write
- shared Workspace Home editor enablement
- live parity doc update

Excluded:

- generic `file_write` in web
- global Codex file writes
- agents settings writes
- environment settings writes
- worktree lifecycle writes
- Codex update or feature mutation work

## File Structure

Modify:

- `src-tauri/src/files/mod.rs` - add narrow `write_workspace_agent_md` command and remote routing.
- `src-tauri/src/bin/codex_monitor_daemon.rs` - expose a dedicated daemon method backed by `file_write_core()`.
- `src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs` - route `write_workspace_agent_md`.
- `src-tauri/src/lib.rs` - register the new Tauri command.
- `src-tauri/src/remote_backend/mod.rs` - mark the new RPC retry-safe.
- `src-tauri/src/shared/web_runtime_capabilities.rs` - advertise `files.workspaceAgentsWrite` and allow the narrow RPC.
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` - cover capability payloads and forwarding.
- `src/services/bridge/http.ts` - extend capability validation for `workspaceAgentsWrite`.
- `src/features/app/hooks/useWebRuntimeCapabilities.ts` - add desktop/web defaults for the new capability.
- `src/services/tauri.ts` - route `writeAgentMd()` through `invokeSupportedRpc("write_workspace_agent_md", ...)`.
- `src/features/workspaces/hooks/useWorkspaceAgentMd.ts` - split read/write enablement and remove the blanket web save block.
- `src/features/app/hooks/useMainAppComposerWorkspaceState.ts` - thread read and write capability flags into the workspace AGENTS hook and UI props.
- `src/features/workspaces/components/WorkspaceHome.tsx` - render read-only only when web lacks write support.
- `docs/web-desktop-parity.md` - update the live parity statement.

Tests:

- `src/services/bridge/http.test.ts`
- `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx`
- `src/services/tauri.test.ts`
- `src/features/workspaces/hooks/useWorkspaceAgentMd.test.tsx`
- `src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx`
- `src/features/workspaces/components/WorkspaceHome.test.tsx`
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`

## Task 1: Add Failing Capability And Service Tests

**Files:**

- Modify: `src/services/bridge/http.test.ts`
- Modify: `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx`
- Modify: `src/services/tauri.test.ts`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`

- [ ] **Step 1: Write failing tests for the new capability shape**

Add assertions that:

- `files.workspaceAgentsWrite` is required in bridge capability payload validation
- desktop defaults expose it as `true`
- safe web fallback exposes it as `false`

- [ ] **Step 2: Write failing tests for the new bridge method**

Add assertions that:

- `/api/capabilities` includes `write_workspace_agent_md`
- `/api/rpc` forwards `write_workspace_agent_md`

- [ ] **Step 3: Write failing service tests**

Add assertions that `writeAgentMd("ws-1", "# Agent")` calls:

```ts
invoke("write_workspace_agent_md", {
  workspaceId: "ws-1",
  content: "# Agent",
});
```

- [ ] **Step 4: Run targeted tests and verify red**

Run:

```bash
npm run test -- src/services/bridge/http.test.ts src/features/app/hooks/useWebRuntimeCapabilities.test.tsx src/services/tauri.test.ts
cd src-tauri && cargo test --bin codex_monitor_web_bridge workspace_agent_md
```

Expected: new assertions fail because the capability and method are not implemented yet.

## Task 2: Add The Narrow Backend And Bridge Path

**Files:**

- Modify: `src-tauri/src/files/mod.rs`
- Modify: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Modify: `src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/remote_backend/mod.rs`
- Modify: `src-tauri/src/shared/web_runtime_capabilities.rs`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- Modify: `src/services/bridge/http.ts`
- Modify: `src/features/app/hooks/useWebRuntimeCapabilities.ts`
- Modify: `src/services/tauri.ts`

- [ ] **Step 1: Implement the dedicated backend command**

Add `write_workspace_agent_md` in the shared file command stack so it:

- routes remotely via `write_workspace_agent_md`
- writes locally with `file_write_core(..., FileScope::Workspace, FileKind::Agents, Some(workspace_id), content)`

- [ ] **Step 2: Implement the capability split**

Extend Rust and TypeScript capability payloads with:

```ts
files: {
  workspaceTree: boolean;
  workspaceAgents: boolean;
  workspaceAgentsWrite: boolean;
  globalAgents: boolean;
  globalConfig: boolean;
}
```

Set desktop default to `true` and safe web fallback to `false`.

- [ ] **Step 3: Route the frontend save helper**

Update `writeAgentMd()` to call:

```ts
return invokeSupportedRpc("write_workspace_agent_md", {
  workspaceId,
  content,
});
```

- [ ] **Step 4: Re-run targeted tests**

Run:

```bash
npm run test -- src/services/bridge/http.test.ts src/features/app/hooks/useWebRuntimeCapabilities.test.tsx src/services/tauri.test.ts
cd src-tauri && cargo test --bin codex_monitor_web_bridge workspace_agent_md
```

Expected: capability and bridge/service tests pass.

## Task 3: Make The Shared Workspace Editor Writable When Allowed

**Files:**

- Modify: `src/features/workspaces/hooks/useWorkspaceAgentMd.ts`
- Modify: `src/features/workspaces/hooks/useWorkspaceAgentMd.test.tsx`
- Modify: `src/features/app/hooks/useMainAppComposerWorkspaceState.ts`
- Modify: `src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx`
- Modify: `src/features/workspaces/components/WorkspaceHome.tsx`
- Modify: `src/features/workspaces/components/WorkspaceHome.test.tsx`

- [ ] **Step 1: Write failing hook and UI tests**

Add tests that assert:

- `useWorkspaceAgentMd()` in web runtime can save when `writeEnabled` is `true`
- `useMainAppComposerWorkspaceState()` passes `writeEnabled` from runtime capabilities
- `WorkspaceHome` stays read-only when only read capability exists
- `WorkspaceHome` becomes editable when write capability exists

- [ ] **Step 2: Implement split read/write gating**

Update `useWorkspaceAgentMd()` to accept both `enabled` and `writeEnabled`, and only skip saves when `writeEnabled` is `false`.

Update workspace state wiring so:

- `agentMdAvailable` continues to track read support
- a new `agentMdWritable` prop tracks write support

- [ ] **Step 3: Update Workspace Home editor behavior**

Use the new `agentMdWritable` prop so:

- unsupported web still disables the editor
- read-only web keeps `readOnly: true`
- writable web uses `readOnly: false` and enables save when dirty

- [ ] **Step 4: Re-run targeted UI tests**

Run:

```bash
npm run test -- src/features/workspaces/hooks/useWorkspaceAgentMd.test.tsx src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx src/features/workspaces/components/WorkspaceHome.test.tsx
```

Expected: hook and shared UI coverage passes.

## Task 4: Update Docs And Run Full Verification

**Files:**

- Modify: `docs/web-desktop-parity.md`

- [ ] **Step 1: Update the live parity doc**

Document that workspace `AGENTS.md` is editable in web runtime only when the bridge advertises `files.workspaceAgentsWrite`, while read-only bridges still support preview/refresh through `files.workspaceAgents`.

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
git add docs/superpowers/specs/2026-04-22-web-parity-workspace-agents-write-design.md \
  docs/superpowers/plans/2026-04-22-web-parity-workspace-agents-write.md \
  docs/web-desktop-parity.md \
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
  src/features/workspaces/hooks/useWorkspaceAgentMd.ts \
  src/features/app/hooks/useMainAppComposerWorkspaceState.ts \
  src/features/workspaces/components/WorkspaceHome.tsx
git commit -m "feat: enable web workspace agents editing"
```

Expected: one clean commit containing the narrow workspace `AGENTS.md` web write slice.
