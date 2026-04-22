# Web Parity Global AGENTS Write Design

## Summary

This document defines the next remote-safe write slice for the web build: allow browser sessions to edit the shared global `AGENTS.md` file in the reduced Codex settings section when the connected bridge explicitly advertises dedicated global AGENTS write support.

The slice stays intentionally narrow. It does not make the reduced web Codex section fully writable, and it does not add write support for `config.toml`, environment settings, agent config files, or worktree lifecycle operations.

## Problem

CodexMonitor already supports:

- shared read-only global `AGENTS.md` preview in the reduced web Codex settings section
- a dedicated global AGENTS file hook backed by `useFileEditor()`
- strict backend file policy for the global `~/.codex/AGENTS.md` file

But saving still fails closed in the browser because:

- `writeGlobalAgentsMd()` still routes through generic `file_write`
- bridge capabilities do not distinguish global AGENTS read support from write support
- the reduced web Codex section hardcodes the global AGENTS card as read-only even when a safer narrow write path could exist

That leaves another unnecessary gap:

- remote users can inspect the shared server-level guidance file
- they still need desktop or shell access for routine instruction updates
- the reduced Codex section is already the right place for this file, but the current UI cannot graduate beyond inspection

## Goals

- Enable editing of global `AGENTS.md` in web runtime.
- Keep the web write path limited to `~/.codex/AGENTS.md` only.
- Reuse existing shared file-policy enforcement for global AGENTS.
- Advertise write support separately from read support.
- Preserve the reduced web Codex section instead of reopening the full desktop Codex surface.

## Non-Goals

- No generic `file_write` support in the web bridge.
- No web write support for global `config.toml`.
- No web support for custom-bin/custom-args Codex updates or doctor mutations.
- No agents settings writes, environment writes, or worktree lifecycle writes.
- No redesign of the Codex settings layout.

## Constraints

- Safety must still be enforced by backend file policy even if the UI advertises save.
- Older bridges must remain read-only and continue to support preview/refresh only.
- The reduced web Codex section must still hide broader desktop-only controls.
- Global AGENTS write support should not implicitly make global config writable.

## Proposed Approach

### Narrow backend command

- Add a dedicated `write_global_agents_md` backend command and remote RPC.
- Implement it by reusing `file_write_core()` with `FileScope::Global` and `FileKind::Agents`.
- Keep generic `file_write` out of the web bridge allowlist.

### Explicit capability split

- Keep `files.globalAgents` as the read capability.
- Add `files.globalAgentsWrite` as a separate write capability.
- Only bridges that advertise `globalAgentsWrite` may enable save in web runtime.

### Reduced Codex section behavior

- Keep the reduced web Codex section path, including read-only config and doctor visibility.
- Make only the global AGENTS editor capability-aware:
  - read-only when `globalAgentsWrite` is absent
  - editable when `globalAgentsWrite` is present
- Leave `global config.toml` explicitly read-only in the same reduced section.

### Frontend save routing

- Route `writeGlobalAgentsMd()` through `invokeSupportedRpc("write_global_agents_md", ...)`.
- Thread `globalAgentsWrite` into settings orchestration and reduced-section props.
- Reuse `useFileEditor()` dirty/save logic rather than adding custom save state.

## Why This Approach

This is the safest next global-write slice because:

- it uses the same policy-backed `AGENTS.md` file kind as the workspace edit path
- it lives inside an existing reduced shared UI surface
- it creates a clean separation between low-risk instruction-file writes and higher-risk config writes
- it keeps the rest of the Codex settings page clearly constrained in web runtime

Opening `config.toml` first would create a much larger blast radius because a malformed or dangerous config can affect the whole remote Codex runtime.

## File Impact

Modify:

- `src-tauri/src/files/mod.rs`
- `src-tauri/src/bin/codex_monitor_daemon.rs`
- `src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/remote_backend/mod.rs`
- `src-tauri/src/shared/web_runtime_capabilities.rs`
- `src-tauri/src/shared/workspace_rpc.rs`
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- `src/services/bridge/http.ts`
- `src/features/app/hooks/useWebRuntimeCapabilities.ts`
- `src/services/tauri.ts`
- `src/features/settings/hooks/useSettingsCodexSection.ts`
- `src/features/settings/components/sections/SettingsCodexSection.tsx`
- `src/features/settings/hooks/useSettingsViewOrchestration.ts`
- `docs/web-desktop-parity.md`

Tests to modify:

- `src/services/bridge/http.test.ts`
- `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx`
- `src/services/tauri.test.ts`
- `src/features/settings/components/SettingsView.test.tsx`
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`

## Testing Strategy

- Add failing bridge tests for `files.globalAgentsWrite` and `write_global_agents_md` forwarding.
- Add failing service tests for `writeGlobalAgentsMd()` routing through the narrow command.
- Add failing SettingsView tests that verify the reduced web Codex section keeps `config.toml` read-only while making global AGENTS editable when the write capability is present.
- Run targeted tests first, then full `npm run test`, `npm run typecheck`, `cargo check`, `cargo test --bin codex_monitor_web_bridge`, and `git diff --check`.

## Success Criteria

This slice is complete when:

- web bridges can advertise `files.globalAgentsWrite`
- `write_global_agents_md` is forwarded through the bridge without enabling generic file writes
- the reduced web Codex section allows saving global AGENTS only when the write capability is present
- global `config.toml` remains read-only in web
- live parity docs describe global AGENTS as capability-gated editable rather than permanently read-only
