# Web Parity Global Codex Files Read-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the next `Phase 2B` web-safe file/environment slice by exposing read-only global `AGENTS.md` and global `config.toml` visibility in web runtime without reopening the broader desktop-only Codex settings surface.

**Architecture:** Add two narrow cross-runtime RPCs, `read_global_agents_md` and `read_global_codex_config_toml`, instead of allowing the generic `file_read` method through the bridge. Reuse the existing shared file-policy core for approved global config paths, advertise `files.globalAgents` and `files.globalConfig` from the bridge capability catalog, and make the web settings navigation capability-aware so it can surface a reduced Codex section that only renders the two file cards in read-only mode.

**Tech Stack:** Rust, Tauri commands, daemon JSON-RPC, Axum bridge, React, TypeScript, Vitest.

---

## Scope Split

This plan covers only the second narrow sub-slice of `Phase 2B` from `docs/superpowers/specs/2026-04-21-web-parity-roadmap-design.md`:

- read-only global `AGENTS.md` visibility in web runtime
- read-only global Codex `config.toml` visibility in web runtime
- capability-aware web settings navigation that can reveal a reduced Codex section only when those file capabilities are available

This plan does not cover:

- global file writes in web runtime
- Codex doctor or Codex update in web runtime
- web mutation of Codex path, Codex args, default model, default access mode, or review mode
- agent config editing or agent management in web runtime
- feature flags or other web settings sections outside the reduced Codex files slice

## File Structure

Modify:

- `src-tauri/src/files/mod.rs` - add narrow read-only global file command wrappers.
- `src-tauri/src/bin/codex_monitor_daemon.rs` - add daemon support for the new global file read methods.
- `src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs` - route the two new RPC methods.
- `src-tauri/src/shared/web_runtime_capabilities.rs` - advertise `globalAgents` and `globalConfig` support and allow the narrow RPCs through the bridge.
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` - bridge tests for capability advertising and RPC forwarding.
- `src-tauri/src/lib.rs` - register the new Tauri commands.
- `src-tauri/src/remote_backend/mod.rs` - allow reconnect retry for the new read-only RPCs.
- `src/services/tauri.ts` - route `readGlobalAgentsMd()` and `readGlobalCodexConfigToml()` through the new supported RPC methods.
- `src/services/tauri.test.ts` - verify desktop invocation and web bridge routing.
- `src/features/settings/components/settingsViewConstants.ts` - derive capability-aware web-visible settings sections.
- `src/features/settings/components/SettingsView.tsx` - accept runtime capabilities and show the reduced Codex section only when supported.
- `src/features/app/hooks/useMainAppModals.ts` - pass runtime capabilities into settings props.
- `src/features/settings/hooks/useSettingsViewOrchestration.ts` - thread reduced Codex-section mode into settings orchestration.
- `src/features/settings/hooks/useSettingsCodexSection.ts` - gate expensive desktop-only Codex controls and keep global file editors active only when their capabilities are available.
- `src/features/settings/components/sections/SettingsCodexSection.tsx` - render a web read-only variant that only exposes the two file editors.
- `src/features/settings/components/SettingsView.test.tsx` - cover web visibility, read-only rendering, and inert unsupported behavior.
- `docs/web-desktop-parity.md` - update the live parity doc for global file visibility.

No global write commands should be added in this slice.

### Task 1: Add Narrow Global File Read RPCs

**Files:**

- Modify: `src-tauri/src/files/mod.rs`
- Modify: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Modify: `src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs`
- Modify: `src-tauri/src/shared/web_runtime_capabilities.rs`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/remote_backend/mod.rs`

- [ ] **Step 1: Add failing bridge tests for global file capabilities and forwarding**

Extend `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` with tests for:

- capability advertisement of `files.global_agents`
- capability advertisement of `files.global_config`
- forwarding `read_global_agents_md`
- forwarding `read_global_codex_config_toml`

Run:

```bash
cd src-tauri
cargo test --bin codex_monitor_web_bridge global_agents
cargo test --bin codex_monitor_web_bridge global_codex_config
```

Expected: the capability flags are still false and the methods are still blocked.

- [ ] **Step 2: Add app and daemon read methods for the two approved global paths**

In `src-tauri/src/files/mod.rs`, add narrow Tauri commands that reuse the existing file-policy core:

- `read_global_agents_md`
- `read_global_codex_config_toml`

Each command should:

- call the daemon by its narrow method name in remote mode
- call `file_read_core()` locally with fixed `FileScope::Global` and the corresponding `FileKind`

Mirror that shape in the daemon and route the methods in `rpc/workspace.rs`.

Do not add a generic web `file_read` bridge path in this batch.

- [ ] **Step 3: Advertise the new global file capabilities through the bridge catalog**

Update `src-tauri/src/shared/web_runtime_capabilities.rs` so the allowlist includes:

- `read_global_agents_md`
- `read_global_codex_config_toml`

And enable:

- `files.global_agents = true`
- `files.global_config = true`

Keep all write paths and unrelated operations unchanged.

- [ ] **Step 4: Run the targeted Rust verification**

Run:

```bash
cd src-tauri
cargo test --bin codex_monitor_web_bridge
cargo check
```

Expected: the bridge suite and compile pass with the new methods wired across app, daemon, and bridge.

### Task 2: Route The Frontend Through The Narrow Global Read RPCs

**Files:**

- Modify: `src/services/tauri.ts`
- Modify: `src/services/tauri.test.ts`

- [ ] **Step 1: Add failing service coverage for web global file reads**

Extend `src/services/tauri.test.ts` with web-runtime assertions for:

- `readGlobalAgentsMd()` routing through `bridgeRpc`
- `readGlobalCodexConfigToml()` routing through `bridgeRpc`

Also update the existing desktop expectations so they assert the new narrow commands instead of `file_read`.

Run:

```bash
npm run test -- src/services/tauri.test.ts
```

Expected: the new web assertions fail because both wrappers still use desktop-only `file_read`.

- [ ] **Step 2: Route the two read wrappers through `invokeSupportedRpc()`**

Update `src/services/tauri.ts`:

- `readGlobalAgentsMd()` -> `read_global_agents_md`
- `readGlobalCodexConfigToml()` -> `read_global_codex_config_toml`

Do not change the write wrappers in this slice.

- [ ] **Step 3: Run the targeted service tests**

Run:

```bash
npm run test -- src/services/tauri.test.ts
```

Expected: both desktop and web assertions pass.

### Task 3: Surface A Capability-Aware Reduced Codex Section In Web

**Files:**

- Modify: `src/features/settings/components/settingsViewConstants.ts`
- Modify: `src/features/settings/components/SettingsView.tsx`
- Modify: `src/features/app/hooks/useMainAppModals.ts`
- Modify: `src/features/settings/hooks/useSettingsViewOrchestration.ts`
- Modify: `src/features/settings/hooks/useSettingsCodexSection.ts`
- Modify: `src/features/settings/components/sections/SettingsCodexSection.tsx`
- Modify: `src/features/settings/components/SettingsView.test.tsx`

- [ ] **Step 1: Add failing settings tests for capability-aware web visibility**

Extend `src/features/settings/components/SettingsView.test.tsx` with two web cases:

- the Codex nav button remains hidden and inert when both global file capabilities are unavailable
- the Codex nav button appears when either global file capability is available, and the section renders read-only file cards without desktop mutation controls

Useful assertions:

- the web section list now includes `Codex` only when capability is present
- the doctor/update buttons are absent in web read-only mode
- the global file textareas are `readOnly === true`
- refresh buttons stay enabled
- save buttons stay disabled

Run:

```bash
npm run test -- src/features/settings/components/SettingsView.test.tsx
```

Expected: the new web visibility assertions fail before implementation.

- [ ] **Step 2: Derive web-visible settings sections from runtime capabilities**

Replace the fixed `SETTINGS_WEB_SECTION_IDS` list with a helper that can add sections conditionally, for example:

- base web sections: `projects`, `display`, `composer`, `git`, `about`
- add `codex` when `files.globalAgents || files.globalConfig`

Thread the required runtime capability subset from `MainApp` through `useMainAppModals` into `SettingsView`.

This helper should stay easy to extend later for feature-flag or diagnostics sections.

- [ ] **Step 3: Gate the Codex section into a web read-only files mode**

Update orchestration so the Codex hook/component know:

- whether web runtime is active
- whether global AGENTS is available
- whether global config is available
- whether the section should render in reduced read-only mode

In that mode:

- do not load default models
- do not render Codex path/args inputs
- do not render doctor or update controls
- do not render other mutable settings controls from this section
- do keep the two file cards alive when their respective capabilities are available

- [ ] **Step 4: Render the global file editors as read-only in web runtime**

Update `SettingsCodexSection.tsx` so the web reduced variant:

- shows a short explanatory subtitle for remote read-only visibility
- marks the file editor meta as `Read-only`
- passes `readOnly` to `FileEditorCard`
- enables refresh when the capability is available
- keeps save disabled in web runtime
- hides any editor whose capability is unavailable instead of showing a broken card

Do not enable writes in web runtime.

- [ ] **Step 5: Run the targeted settings tests**

Run:

```bash
npm run test -- src/features/settings/components/SettingsView.test.tsx
```

Expected: the web Codex section behaves as a reduced, capability-aware read-only surface.

### Task 4: Update The Live Parity Doc And Verify End-To-End

**Files:**

- Modify: `docs/web-desktop-parity.md`

- [ ] **Step 1: Update the live parity doc**

Move global `AGENTS.md` and global `config.toml` out of the pure desktop-only list and clarify their new scope:

- web supports read-only preview and refresh when the bridge advertises `files.globalAgents` / `files.globalConfig`
- editing remains desktop-only

- [ ] **Step 2: Run the full validation matrix**

Run:

```bash
npm run test
npm run typecheck
cd src-tauri && cargo check
cd src-tauri && cargo test --bin codex_monitor_web_bridge
git diff --check
```

Expected: all commands pass.

- [ ] **Step 3: Commit the slice**

Run:

```bash
git add \
  docs/web-desktop-parity.md \
  docs/superpowers/plans/2026-04-21-web-parity-global-codex-files-readonly.md \
  src-tauri/src/files/mod.rs \
  src-tauri/src/bin/codex_monitor_daemon.rs \
  src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs \
  src-tauri/src/shared/web_runtime_capabilities.rs \
  src-tauri/src/bin/codex_monitor_web_bridge/routes.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/remote_backend/mod.rs \
  src/services/tauri.ts \
  src/services/tauri.test.ts \
  src/features/settings/components/settingsViewConstants.ts \
  src/features/settings/components/SettingsView.tsx \
  src/features/app/hooks/useMainAppModals.ts \
  src/features/settings/hooks/useSettingsViewOrchestration.ts \
  src/features/settings/hooks/useSettingsCodexSection.ts \
  src/features/settings/components/sections/SettingsCodexSection.tsx \
  src/features/settings/components/SettingsView.test.tsx
git commit -m "feat: add web global codex file visibility"
```

Expected: one clean commit containing the narrow Phase 2B global file visibility slice.
