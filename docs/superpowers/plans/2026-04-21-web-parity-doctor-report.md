# Web Parity Doctor Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the next `Phase 3` web diagnostics slice by exposing a read-only Codex doctor report in web runtime without allowing browser callers to override the remote server's Codex binary or args.

**Architecture:** Add one narrow cross-runtime RPC that always runs doctor against the server's current persisted Codex configuration, advertise it as `operations.doctorReport`, and extend the reduced web Codex settings section so it can surface a `Run doctor` action and doctor result card when that capability is present. Keep the existing desktop `codex_doctor(codexBin, codexArgs)` path unchanged.

**Tech Stack:** Rust, shared Tauri modules, daemon JSON-RPC, Axum bridge, React, TypeScript, Vitest.

---

## Scope Split

This plan covers only the read-only doctor-report portion of `Phase 3` from `docs/superpowers/specs/2026-04-21-web-parity-roadmap-design.md`.

Included:

- a new web-safe doctor RPC that uses current server config only
- bridge allowlisting and capability advertisement for `operations.doctorReport`
- frontend service routing for web doctor reads
- capability-aware web Codex settings rendering for the doctor action and result card
- doc updates for the live parity snapshot

Excluded:

- browser overrides for `codexBin` or `codexArgs`
- Codex update in web runtime
- feature-flag visibility or mutation
- any daemon, Tailscale, or updater control actions

## File Structure

Modify:

- `src-tauri/src/codex/mod.rs` - add a narrow current-config doctor command for app runtime.
- `src-tauri/src/bin/codex_monitor_daemon.rs` - add daemon support for the narrow doctor method.
- `src-tauri/src/bin/codex_monitor_daemon/rpc/codex.rs` - route the new daemon RPC.
- `src-tauri/src/shared/web_runtime_capabilities.rs` - advertise `operations.doctorReport` and allow only the narrow doctor RPC through the bridge.
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` - bridge tests for doctor capability advertising and forwarding.
- `src-tauri/src/lib.rs` - register the new Tauri command.
- `src-tauri/src/remote_backend/mod.rs` - allow reconnect retry for the new read-only RPC if required.
- `src/services/tauri.ts` - route web doctor reads through the narrow supported RPC while preserving desktop behavior.
- `src/services/tauri.test.ts` - verify desktop invoke behavior and web bridge routing.
- `src/features/settings/components/settingsViewConstants.ts` - reveal `Codex` in web when doctor capability exists even if file capabilities do not.
- `src/features/settings/hooks/useSettingsViewOrchestration.ts` - thread doctor capability into reduced web Codex mode.
- `src/features/settings/hooks/useSettingsCodexSection.ts` - gate the web doctor action/result separately from desktop doctor controls.
- `src/features/settings/components/sections/SettingsCodexSection.tsx` - render the read-only web doctor action and result card.
- `src/features/settings/components/SettingsView.test.tsx` - cover capability-aware web doctor visibility and behavior.
- `docs/web-desktop-parity.md` - update live-state docs for doctor support.

No new browser write or server-mutation surface should be added in this slice.

### Task 1: Add A Narrow Current-Config Doctor RPC

**Files:**

- Modify: `src-tauri/src/codex/mod.rs`
- Modify: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Modify: `src-tauri/src/bin/codex_monitor_daemon/rpc/codex.rs`
- Modify: `src-tauri/src/shared/web_runtime_capabilities.rs`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/remote_backend/mod.rs`

- [ ] **Step 1: Add failing bridge tests for doctor capability and forwarding**

Extend `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` with tests that assert:

- `capabilities.operations.doctor_report` becomes `true`
- `methods` includes the narrow doctor RPC name
- a POST to `/api/rpc` forwards the narrow doctor RPC with empty params

Run:

```bash
cd src-tauri
cargo test --bin codex_monitor_web_bridge doctor
```

Expected: the capability is still false and the bridge still rejects the method.

- [ ] **Step 2: Add the narrow current-config doctor command in app and daemon surfaces**

Introduce a new command/method pair that always calls:

```rust
codex_aux_core::codex_doctor_core(&state.app_settings, None, None).await
```

Wire it through:

- `src-tauri/src/codex/mod.rs`
- `src-tauri/src/bin/codex_monitor_daemon.rs`
- `src-tauri/src/bin/codex_monitor_daemon/rpc/codex.rs`
- `src-tauri/src/lib.rs`

Use a distinct RPC name such as `codex_doctor_current_config` so the browser does not gain the broader `codex_doctor(codexBin, codexArgs)` contract.

- [ ] **Step 3: Advertise only the narrow doctor operation through the bridge capability catalog**

Update `src-tauri/src/shared/web_runtime_capabilities.rs` so:

- the allowlist includes `codex_doctor_current_config`
- `operations.doctor_report = true`
- all update and feature-flag operations remain unchanged

If `src-tauri/src/remote_backend/mod.rs` maintains a retry allowlist for supported read-only calls, add the new method there too.

- [ ] **Step 4: Run targeted Rust verification**

Run:

```bash
cd src-tauri
cargo test --bin codex_monitor_web_bridge
cargo check
```

Expected: bridge tests and compile succeed with the new command wired across app, daemon, and bridge.

### Task 2: Route Web Doctor Reads Through The Narrow RPC

**Files:**

- Modify: `src/services/tauri.ts`
- Modify: `src/services/tauri.test.ts`

- [ ] **Step 1: Add failing service coverage for web doctor routing**

Extend `src/services/tauri.test.ts` with a web-runtime assertion that `runCodexDoctor()` uses bridge RPC and sends the narrow method with empty params.

Also keep the existing desktop expectation verifying `codex_doctor` still invokes the desktop command with `{ codexBin, codexArgs }`.

Run:

```bash
npm run test -- src/services/tauri.test.ts
```

Expected: the new web assertion fails because `runCodexDoctor()` still requires desktop runtime.

- [ ] **Step 2: Branch the doctor wrapper by runtime**

Update `src/services/tauri.ts` so:

- desktop runtime keeps `invoke("codex_doctor", { codexBin, codexArgs })`
- web runtime uses `invokeSupportedRpc("codex_doctor_current_config")`

Do not let web callers pass arbitrary `codexBin` or `codexArgs` through the bridge.

- [ ] **Step 3: Run the targeted service tests**

Run:

```bash
npm run test -- src/services/tauri.test.ts
```

Expected: desktop and web doctor assertions both pass.

### Task 3: Surface Doctor Report In The Reduced Web Codex Section

**Files:**

- Modify: `src/features/settings/components/settingsViewConstants.ts`
- Modify: `src/features/settings/hooks/useSettingsViewOrchestration.ts`
- Modify: `src/features/settings/hooks/useSettingsCodexSection.ts`
- Modify: `src/features/settings/components/sections/SettingsCodexSection.tsx`
- Modify: `src/features/settings/components/SettingsView.test.tsx`

- [ ] **Step 1: Add failing settings tests for capability-aware web doctor visibility**

Extend `src/features/settings/components/SettingsView.test.tsx` with web cases that assert:

- `Codex` appears when `operations.doctorReport` is true even if global file capabilities are false
- the reduced web Codex section shows `Run doctor`
- path, args, save, and update controls remain hidden
- clicking `Run doctor` renders the doctor result card

Run:

```bash
npm run test -- src/features/settings/components/SettingsView.test.tsx
```

Expected: the new web doctor assertions fail before implementation.

- [ ] **Step 2: Make web Codex visibility capability-aware for doctor support**

Update `src/features/settings/components/settingsViewConstants.ts` so the web `Codex` section appears when either:

- `files.globalAgents`
- `files.globalConfig`
- `operations.doctorReport`

Keep all other section visibility rules unchanged.

- [ ] **Step 3: Thread doctor capability into reduced web Codex mode**

Update orchestration/hooks so the reduced web Codex section knows:

- whether it is in reduced web mode
- whether global file cards should render
- whether the doctor action/result should render

In reduced web mode:

- show doctor UI only when `operations.doctorReport` is true
- keep path/args inputs hidden
- keep update button hidden
- keep file editors read-only when they are present

- [ ] **Step 4: Reuse the existing doctor state/result card in the reduced web section**

Update `src/features/settings/components/sections/SettingsCodexSection.tsx` so the reduced web branch can render:

- the existing doctor action button
- the existing doctor result card markup

without rendering the desktop mutation controls.

- [ ] **Step 5: Run targeted frontend verification**

Run:

```bash
npm run test -- src/features/settings/components/SettingsView.test.tsx
```

Expected: the web doctor and reduced Codex tests pass.

### Task 4: Update Live Docs And Run Full Verification

**Files:**

- Modify: `docs/web-desktop-parity.md`

- [ ] **Step 1: Update the live parity doc**

Document that web now supports a read-only doctor report in the reduced Codex settings section when the bridge advertises `operations.doctorReport`, and clarify that Codex update and mutable Codex controls remain desktop-only.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run test
npm run typecheck
cd src-tauri && cargo check
cd src-tauri && cargo test --bin codex_monitor_web_bridge
git diff --check
```

Expected: all commands pass on the feature branch.

- [ ] **Step 3: Commit**

Run:

```bash
git add \
  docs/web-desktop-parity.md \
  docs/superpowers/plans/2026-04-21-web-parity-doctor-report.md \
  src-tauri/src/codex/mod.rs \
  src-tauri/src/bin/codex_monitor_daemon.rs \
  src-tauri/src/bin/codex_monitor_daemon/rpc/codex.rs \
  src-tauri/src/bin/codex_monitor_web_bridge/routes.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/remote_backend/mod.rs \
  src-tauri/src/shared/web_runtime_capabilities.rs \
  src/services/tauri.ts \
  src/services/tauri.test.ts \
  src/features/settings/components/settingsViewConstants.ts \
  src/features/settings/hooks/useSettingsViewOrchestration.ts \
  src/features/settings/hooks/useSettingsCodexSection.ts \
  src/features/settings/components/sections/SettingsCodexSection.tsx \
  src/features/settings/components/SettingsView.test.tsx
git commit -m "feat: add web doctor report visibility"
```

Expected: one clean commit containing the narrow doctor-report slice.

## Self-Review

- Spec coverage: the plan covers the bridge/backend RPC, frontend routing, reduced web settings behavior, docs, and verification for the narrow doctor slice only.
- Placeholder scan: no TODOs or deferred implementation notes remain in the task steps.
- Type consistency: the plan consistently uses a distinct narrow RPC for web doctor reads and keeps the broader desktop `codex_doctor` contract untouched.
