# Web Parity Read-Only Feature Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a read-only web `Features` settings section backed by `experimental_feature_list` without allowing browser-based feature mutation.

**Architecture:** Route the existing read-only feature-list RPC through the web bridge, advertise it via `operations.featureFlags`, and adapt the shared settings section to support a reduced read-only web mode that hides config-open and toggle-mutation actions.

**Tech Stack:** Rust, Axum bridge, React, TypeScript, Vitest.

---

## Scope Split

This plan covers only the read-only feature-visibility portion of `Phase 3` from `docs/superpowers/specs/2026-04-21-web-parity-readonly-feature-flags-design.md`.

Included:

- bridge allowlisting and capability advertisement for `experimental_feature_list`
- web service routing for read-only feature-list reads
- reduced web `Features` settings rendering
- live parity doc updates

Excluded:

- `set_codex_feature_flag` in web runtime
- config reveal/open behavior in web runtime
- web mutation of app-settings-backed feature rows

## File Structure

Modify:

- `src-tauri/src/shared/web_runtime_capabilities.rs` - allow `experimental_feature_list` and advertise `operations.featureFlags`.
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` - bridge tests for feature-flag capability and forwarding.
- `src/services/tauri.ts` - route read-only feature-list requests through `invokeSupportedRpc` in web runtime.
- `src/services/tauri.test.ts` - verify web bridge routing and desktop invoke behavior.
- `src/features/settings/components/settingsViewConstants.ts` - reveal `Features` in web when `operations.featureFlags` is available.
- `src/features/settings/hooks/useSettingsViewOrchestration.ts` - thread web read-only features mode into the section hook.
- `src/features/settings/hooks/useSettingsFeaturesSection.ts` - support read-only mode and avoid mutation/config-open behavior.
- `src/features/settings/components/sections/SettingsFeaturesSection.tsx` - render a reduced read-only web view.
- `src/features/settings/components/SettingsView.test.tsx` - cover reduced web feature visibility and disabled controls.
- `docs/web-desktop-parity.md` - update live-state parity notes.

### Task 1: Expose Read-Only Feature List Through The Bridge

**Files:**

- Modify: `src-tauri/src/shared/web_runtime_capabilities.rs`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- Modify: `src/services/tauri.ts`
- Modify: `src/services/tauri.test.ts`

- [ ] **Step 1: Add failing bridge tests**

Extend `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` with tests that assert:

- `capabilities.operations.feature_flags` becomes `true`
- `methods` includes `experimental_feature_list`
- a POST to `/api/rpc` forwards `experimental_feature_list`

Run:

```bash
cd src-tauri
cargo test --bin codex_monitor_web_bridge feature
```

Expected: the capability is still false or the method is still rejected.

- [ ] **Step 2: Add failing service coverage**

Extend `src/services/tauri.test.ts` with:

- a web-runtime assertion that `getExperimentalFeatureList()` uses bridge RPC
- a desktop assertion that it still invokes `experimental_feature_list` through the desktop invoke path

Run:

```bash
npm run test -- src/services/tauri.test.ts
```

Expected: the web assertion fails because the wrapper still requires desktop runtime.

- [ ] **Step 3: Implement bridge and service routing**

Update:

- `src-tauri/src/shared/web_runtime_capabilities.rs`
  - add `experimental_feature_list` to the allowlist
  - set `operations.feature_flags = true`
- `src/services/tauri.ts`
  - route web `getExperimentalFeatureList()` through `invokeSupportedRpc("experimental_feature_list", ...)`
  - keep `setCodexFeatureFlag()` desktop-only

- [ ] **Step 4: Run targeted bridge/service verification**

Run:

```bash
cd src-tauri && cargo test --bin codex_monitor_web_bridge
npm run test -- src/services/tauri.test.ts
```

Expected: bridge and service tests pass.

### Task 2: Add Reduced Read-Only Web Features UI

**Files:**

- Modify: `src/features/settings/components/settingsViewConstants.ts`
- Modify: `src/features/settings/hooks/useSettingsViewOrchestration.ts`
- Modify: `src/features/settings/hooks/useSettingsFeaturesSection.ts`
- Modify: `src/features/settings/components/sections/SettingsFeaturesSection.tsx`
- Modify: `src/features/settings/components/SettingsView.test.tsx`

- [ ] **Step 1: Add failing settings tests**

Extend `src/features/settings/components/SettingsView.test.tsx` with a web case that asserts:

- `Features` appears when `operations.featureFlags` is true
- remote feature rows render
- their toggle buttons are disabled
- the `Config file`, `Personality`, and `Pause queued messages when a response is required` rows stay hidden in reduced web mode

Run:

```bash
npm run test -- src/features/settings/components/SettingsView.test.tsx
```

Expected: the reduced web feature assertions fail before implementation.

- [ ] **Step 2: Reveal the section only when supported**

Update `src/features/settings/components/settingsViewConstants.ts` so the web build includes `features` when `operations.featureFlags` is available.

- [ ] **Step 3: Thread read-only mode through the features hook**

Update `src/features/settings/hooks/useSettingsViewOrchestration.ts` and `src/features/settings/hooks/useSettingsFeaturesSection.ts` so the features section can distinguish:

- full desktop mode
- reduced web read-only mode

In reduced web mode:

- load the feature list
- skip config-open behavior
- skip app-settings-backed feature rows
- keep toggle actions inert

- [ ] **Step 4: Render the reduced web Features section**

Update `src/features/settings/components/sections/SettingsFeaturesSection.tsx` so reduced web mode:

- uses read-only explanatory copy
- renders only Codex-returned feature rows
- leaves toggle state visible but disabled

- [ ] **Step 5: Run targeted settings verification**

Run:

```bash
npm run test -- src/features/settings/components/SettingsView.test.tsx
```

Expected: the reduced web `Features` tests pass without breaking desktop coverage.

### Task 3: Update Docs And Run Full Verification

**Files:**

- Modify: `docs/web-desktop-parity.md`

- [ ] **Step 1: Update live parity docs**

Document that web now supports a reduced read-only `Features` section when the connected bridge advertises `operations.featureFlags`.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run test
npm run typecheck
cd src-tauri && cargo check
git diff --check
```

Expected: all commands pass.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-04-21-web-parity-readonly-feature-flags-design.md \
  docs/superpowers/plans/2026-04-21-web-parity-readonly-feature-flags.md \
  docs/web-desktop-parity.md \
  src-tauri/src/shared/web_runtime_capabilities.rs \
  src-tauri/src/bin/codex_monitor_web_bridge/routes.rs \
  src/services/tauri.ts \
  src/services/tauri.test.ts \
  src/features/settings/components/settingsViewConstants.ts \
  src/features/settings/hooks/useSettingsViewOrchestration.ts \
  src/features/settings/hooks/useSettingsFeaturesSection.ts \
  src/features/settings/components/sections/SettingsFeaturesSection.tsx \
  src/features/settings/components/SettingsView.test.tsx
git commit -m "feat: add web readonly feature visibility"
```

Expected: one commit capturing the read-only web feature-flags slice.
