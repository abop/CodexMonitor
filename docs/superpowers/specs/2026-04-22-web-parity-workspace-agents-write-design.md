# Web Parity Workspace AGENTS Write Design

## Summary

This document defines the first remote-safe write slice for the web build: allow browser sessions to edit the active workspace `AGENTS.md` file in Workspace Home when the connected bridge explicitly advertises a dedicated write capability.

The slice stays narrow on purpose. It does not reopen generic `file_write`, and it does not add write support for global Codex files, agent config files, environment settings, or worktree lifecycle operations.

## Problem

CodexMonitor already supports:

- shared read-only workspace `AGENTS.md` preview in web runtime
- a shared `FileEditorCard` surface in Workspace Home
- strict backend file policy for workspace-root `AGENTS.md`

But saving still fails closed in the browser because:

- `writeAgentMd()` still routes through generic desktop-only `file_write`
- `useWorkspaceAgentMd()` hard-blocks saving in web runtime
- bridge capabilities do not distinguish read support from write support

That leaves an awkward gap:

- browser users can inspect remote workspace instructions
- they still have to switch to desktop or shell access for the smallest safe file edit
- the existing UI suggests an editor, but web deliberately freezes it in read-only mode

## Goals

- Enable editing of workspace `AGENTS.md` in web runtime.
- Keep the web write path narrowly scoped to one file in one workspace.
- Reuse existing shared file-policy enforcement instead of introducing parallel validation.
- Advertise write support separately from read support so bridges fail closed by default.
- Preserve the current shared editor UX, only making it writable when the bridge allows it.

## Non-Goals

- No generic `file_write` support in the web bridge.
- No web write support for global `AGENTS.md` or global `config.toml`.
- No web write support for agent config files or environment settings.
- No worktree creation, setup execution, terminal launch, or feature-flag mutation work in this slice.
- No new editor surface outside Workspace Home.

## Constraints

- Safety must be enforced server-side, not only by capability-aware UI.
- Unsupported or older bridges must keep the current read-only behavior.
- Desktop behavior should remain unchanged and continue to allow saving.
- The new write path should use the same policy that already constrains workspace `AGENTS.md` reads and writes to the workspace root.

## Proposed Approach

### Narrow backend command

- Add a dedicated `write_workspace_agent_md` backend command and remote RPC.
- Implement it by reusing `file_write_core()` with `FileScope::Workspace` and `FileKind::Agents`.
- Keep the existing generic `file_write` command desktop-only from the web bridge perspective.

### Explicit capability split

- Keep `files.workspaceAgents` as the read capability.
- Add `files.workspaceAgentsWrite` as a separate write capability.
- Only bridges that advertise `workspaceAgentsWrite` may expose save in web runtime.

### Shared editor behavior

- `useWorkspaceAgentMd()` should accept separate read and write enablement.
- Workspace Home should stay read-only in web when only `workspaceAgents` is available.
- Workspace Home should become editable in web only when `workspaceAgentsWrite` is also available.
- Desktop should remain writable because desktop defaults all supported capabilities to `true`.

### Bridge routing

- Add `write_workspace_agent_md` to the web bridge allowlist.
- Keep request/response payloads simple: `{ workspaceId, content }` with `ok`/void success semantics.
- Route frontend `writeAgentMd()` through `invokeSupportedRpc()` so desktop uses invoke directly and web uses the bridge.

## Why This Approach

This is the best first remote-write slice because it is:

- high value: `AGENTS.md` is a core agent-guidance file
- low blast radius: one well-known filename inside one known workspace root
- already policy-backed: the backend has strict path rules for this file kind
- incremental: it introduces the capability split we will need for later write features without reopening broad write access

Allowing generic file writes first would blur the trust boundary and make later safety review much harder.

## File Impact

Modify:

- `src-tauri/src/files/mod.rs`
- `src-tauri/src/bin/codex_monitor_daemon.rs`
- `src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/remote_backend/mod.rs`
- `src-tauri/src/shared/web_runtime_capabilities.rs`
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- `src/services/bridge/http.ts`
- `src/features/app/hooks/useWebRuntimeCapabilities.ts`
- `src/services/tauri.ts`
- `src/features/workspaces/hooks/useWorkspaceAgentMd.ts`
- `src/features/app/hooks/useMainAppComposerWorkspaceState.ts`
- `src/features/workspaces/components/WorkspaceHome.tsx`
- `docs/web-desktop-parity.md`

Tests to modify:

- `src/services/bridge/http.test.ts`
- `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx`
- `src/services/tauri.test.ts`
- `src/features/workspaces/hooks/useWorkspaceAgentMd.test.tsx`
- `src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx`
- `src/features/workspaces/components/WorkspaceHome.test.tsx`
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`

## Testing Strategy

- Add failing bridge tests for capability advertising and RPC forwarding of `write_workspace_agent_md`.
- Add failing service tests for `writeAgentMd()` routing through the supported RPC path.
- Add failing hook tests for web save enablement when write capability is present.
- Add failing Workspace Home tests for capability-aware editable vs read-only rendering.
- Run targeted tests first, then full `npm run test`, `npm run typecheck`, `cargo check`, `cargo test --bin codex_monitor_web_bridge`, and `git diff --check`.

## Success Criteria

This slice is complete when:

- web bridges can advertise `files.workspaceAgentsWrite`
- `write_workspace_agent_md` is forwarded through the bridge without exposing generic `file_write`
- web Workspace Home can save `AGENTS.md` only when the write capability is present
- older or read-only bridges still render the editor as read-only
- live parity docs describe workspace `AGENTS.md` as capability-gated editable rather than permanently read-only in web
