# Web Parity Global Config Write Design

## Summary

This document defines the next narrow write slice for the web build: allow browser sessions to edit the shared global `config.toml` file in the reduced Codex settings section when the connected bridge explicitly advertises dedicated global config write support.

This slice is intentionally more cautious than the AGENTS work. It still keeps the reduced web Codex section limited, and it does not open generic file writes, environment writes, or worktree lifecycle controls.

## Problem

CodexMonitor already supports:

- read-only global `config.toml` preview in the reduced web Codex settings section
- a dedicated `useGlobalCodexConfigToml()` editor hook backed by `useFileEditor()`
- strict backend file policy for the global `~/.codex/config.toml` file

But browser saves still fail closed because:

- `writeGlobalCodexConfigToml()` still routes through generic `file_write`
- bridge capabilities do not distinguish global config read support from write support
- the reduced web Codex section hardcodes the config editor as read-only even when a narrow, explicit write path could exist

That leaves a mismatch with the existing product surface:

- desktop already allows editing this file
- web already has the exact editor surface in place
- remote users still have to fall back to shell or desktop for a focused configuration change

## Goals

- Enable editing of global `config.toml` in web runtime.
- Keep the browser write path limited to `~/.codex/config.toml`.
- Advertise write support separately from read support.
- Preserve the reduced web Codex section rather than reopening full desktop controls.
- Keep the rest of the web Codex surface capability-gated and explicit.

## Non-Goals

- No generic `file_write` support in the web bridge.
- No expansion of the reduced web Codex section into the full desktop section.
- No automatic validation, migration, or schema enforcement for config contents in this slice.
- No environment settings, agents settings, feature flags, or worktree writes.

## Constraints

- Misconfigured `config.toml` can affect the remote Codex runtime more broadly than `AGENTS.md`.
- Safety must still fail closed through backend policy and bridge capability gating.
- Older bridges must keep the current read-only config experience.
- This slice should not imply that all Codex settings are now safely writable from web.

## Proposed Approach

### Narrow backend command

- Add a dedicated `write_global_codex_config_toml` backend command and remote RPC.
- Implement it by reusing `file_write_core()` with `FileScope::Global` and `FileKind::Config`.
- Keep generic `file_write` out of the web bridge allowlist.

### Explicit capability split

- Keep `files.globalConfig` as the read capability.
- Add `files.globalConfigWrite` as a separate write capability.
- Only bridges that advertise `globalConfigWrite` may enable save in web runtime.

### Reduced Codex section behavior

- Keep the reduced web Codex section structure.
- Leave doctor visibility and runtime summary behavior unchanged.
- Make only the global config card capability-aware:
  - read-only when `globalConfigWrite` is absent
  - editable when `globalConfigWrite` is present
- Preserve existing global AGENTS behavior from the prior slice.

### Frontend save routing

- Route `writeGlobalCodexConfigToml()` through `invokeSupportedRpc("write_global_codex_config_toml", ...)`.
- Thread `globalConfigWrite` into settings orchestration and reduced-section props.
- Continue using `useFileEditor()` dirty/save behavior so the save button only enables after a real edit.

## Why This Approach

This is the safest way to offer global config edits from web because it:

- keeps the change scoped to one known file
- reuses existing desktop editor patterns instead of inventing a new surface
- makes the higher-risk write explicit in bridge capabilities
- avoids conflating config editing with broader Codex control writes

The remaining risk is semantic rather than transport-level: users can still save a bad config. That risk already exists on desktop, so the right containment here is a narrow write path and explicit capability gating, not a broader platform split.

## File Impact

Modify:

- `src-tauri/src/files/mod.rs`
- `src-tauri/src/bin/codex_monitor_daemon.rs`
- `src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/remote_backend/mod.rs`
- `src-tauri/src/shared/workspace_rpc.rs`
- `src-tauri/src/shared/web_runtime_capabilities.rs`
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- `src/services/bridge/http.ts`
- `src/features/app/hooks/useWebRuntimeCapabilities.ts`
- `src/services/tauri.ts`
- `src/features/settings/hooks/useSettingsViewOrchestration.ts`
- `src/features/settings/hooks/useSettingsCodexSection.ts`
- `src/features/settings/components/sections/SettingsCodexSection.tsx`
- `docs/web-desktop-parity.md`

Tests to modify:

- `src/services/bridge/http.test.ts`
- `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx`
- `src/services/tauri.test.ts`
- `src/features/settings/components/SettingsView.test.tsx`
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`

## Testing Strategy

- Add failing bridge tests for `files.globalConfigWrite` and `write_global_codex_config_toml` forwarding.
- Add failing service tests for `writeGlobalCodexConfigToml()` routing through the narrow command.
- Add failing SettingsView tests that verify reduced web Codex now allows config edits only when the write capability is present.
- Run targeted tests first, then full `npm run test`, `npm run typecheck`, `cargo check`, `cargo test --bin codex_monitor_web_bridge`, and `git diff --check`.

## Success Criteria

This slice is complete when:

- web bridges can advertise `files.globalConfigWrite`
- `write_global_codex_config_toml` is forwarded through the bridge without enabling generic file writes
- the reduced web Codex section allows saving global config only when `files.globalConfigWrite` is present
- older bridges remain read-only for config
- live parity docs describe global config as capability-gated editable rather than permanently read-only
