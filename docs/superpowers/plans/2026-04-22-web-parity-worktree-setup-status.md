# Web Parity Worktree Setup Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose read-only worktree setup status through the web bridge and surface it in shared sidebar worktree cards.

**Architecture:** Reuse the existing `worktree_setup_status` backend method, advertise it as a bridge capability, route the frontend service through `invokeSupportedRpc()`, and keep the UI limited to capability-aware read-only status pills in existing worktree cards.

**Tech Stack:** Rust, Tauri commands, Axum bridge, React, TypeScript, Vitest.

---

## Scope Split

This plan covers a narrow `Phase 2C` slice from `docs/superpowers/specs/2026-04-22-web-parity-worktree-setup-status-design.md`.

Included:

- bridge capability advertising for `worktree_setup_status`
- web-safe service routing for `getWorktreeSetupStatus()`
- shared sidebar worktree status rendering
- live parity doc update

Excluded:

- `worktree_setup_mark_ran` support in web
- terminal launch or setup execution controls
- worktree creation changes
- setup-script editing changes

## File Structure

Modify:

- `src-tauri/src/shared/web_runtime_capabilities.rs` - advertise `operations.worktreeSetupStatus` and allow `worktree_setup_status`.
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` - bridge capability and forwarding coverage.
- `src/services/bridge/http.ts` - extend capability validation with `operations.worktreeSetupStatus`.
- `src/features/app/hooks/useWebRuntimeCapabilities.ts` - add desktop/web defaults for the new operation.
- `src/services/tauri.ts` - route `getWorktreeSetupStatus()` through `invokeSupportedRpc()`.
- `src/services/tauri.test.ts` - verify web routing for `worktree_setup_status`.
- `src/features/app/components/MainApp.tsx` - wire the status hook and refresh after worktree creation.
- `src/features/app/hooks/useMainAppLayoutSurfaces.ts` - thread status map into shared sidebar props.
- `src/features/app/components/Sidebar.tsx` - accept and pass status map through shared workspace groups.
- `src/features/app/components/SidebarWorkspaceGroups.tsx` - pass status map into clone/worktree sections.
- `src/features/app/components/WorktreeSection.tsx` - feed status into each `WorktreeCard`.
- `src/features/app/components/WorktreeCard.tsx` - render `Setup pending` / `Setup launched` badges.
- `src/styles/sidebar.css` - style the new read-only status pills.
- `src/features/app/components/WorktreeSection.test.tsx` - verify shared rendering.
- `docs/web-desktop-parity.md` - update live parity state.

Create:

- `src/features/app/hooks/useWorktreeSetupStatusMap.ts` - capability-aware status fetching and refresh hook.
- `src/features/app/hooks/useWorktreeSetupStatusMap.test.tsx` - cover fetch filtering, cache clearing, and refresh behavior.

## Task 1: Add Bridge Capability And Web Service Routing

**Files:**

- Modify: `src-tauri/src/shared/web_runtime_capabilities.rs`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- Modify: `src/services/bridge/http.ts`
- Modify: `src/features/app/hooks/useWebRuntimeCapabilities.ts`
- Modify: `src/services/tauri.ts`
- Modify: `src/services/tauri.test.ts`

- [ ] **Step 1: Write failing bridge and service tests**

Add tests that assert:

- `operations.worktreeSetupStatus` is advertised
- `worktree_setup_status` is forwarded through `/api/rpc`
- `getWorktreeSetupStatus()` uses bridge RPC in web runtime

Run:

```bash
npm run test -- src/services/tauri.test.ts src/services/bridge/http.test.ts src/features/app/hooks/useWebRuntimeCapabilities.test.tsx
cd src-tauri && cargo test --bin codex_monitor_web_bridge worktree_setup_status
```

Expected: web routing and bridge-capability assertions fail before implementation.

- [ ] **Step 2: Implement capability and routing**

Update the bridge catalog and service layer so:

- `operations.worktreeSetupStatus` exists in both Rust and TypeScript capability shapes
- desktop defaults it to `true`
- web safe fallback defaults it to `false`
- `getWorktreeSetupStatus()` uses `invokeSupportedRpc("worktree_setup_status", ...)`

- [ ] **Step 3: Re-run targeted tests**

Run:

```bash
npm run test -- src/services/tauri.test.ts src/services/bridge/http.test.ts src/features/app/hooks/useWebRuntimeCapabilities.test.tsx
cd src-tauri && cargo test --bin codex_monitor_web_bridge worktree_setup_status
```

Expected: targeted bridge and service coverage passes.

## Task 2: Add Shared Sidebar Status Rendering

**Files:**

- Create: `src/features/app/hooks/useWorktreeSetupStatusMap.ts`
- Create: `src/features/app/hooks/useWorktreeSetupStatusMap.test.tsx`
- Modify: `src/features/app/components/MainApp.tsx`
- Modify: `src/features/app/hooks/useMainAppLayoutSurfaces.ts`
- Modify: `src/features/app/components/Sidebar.tsx`
- Modify: `src/features/app/components/SidebarWorkspaceGroups.tsx`
- Modify: `src/features/app/components/WorktreeSection.tsx`
- Modify: `src/features/app/components/WorktreeCard.tsx`
- Modify: `src/features/app/components/WorktreeSection.test.tsx`
- Modify: `src/styles/sidebar.css`

- [ ] **Step 1: Write failing shared UI tests**

Add tests that assert:

- `WorktreeSection` renders `Setup pending` when a worktree status map includes a pending entry
- the new hook fetches only worktree entries, clears stale state when disabled, and refreshes on demand

Run:

```bash
npm run test -- src/features/app/components/WorktreeSection.test.tsx src/features/app/hooks/useWorktreeSetupStatusMap.test.tsx
```

Expected: status-label assertions fail before the UI is wired.

- [ ] **Step 2: Implement the capability-aware hook**

Create `useWorktreeSetupStatusMap()` so it:

- skips fetches when capability support is disabled
- only queries worktree workspaces
- maps backend results to `pending` / `launched`
- clears cached state when unavailable
- exposes a manual refresh callback

- [ ] **Step 3: Thread the status map into shared sidebar cards**

Wire the hook through `MainApp`, `useMainAppLayoutSurfaces`, `Sidebar`, `SidebarWorkspaceGroups`, `WorktreeSection`, and `WorktreeCard`, then render a small read-only pill:

- `Setup pending`
- `Setup launched`

Hide the pill when no setup script exists.

- [ ] **Step 4: Re-run targeted UI tests**

Run:

```bash
npm run test -- src/features/app/components/WorktreeSection.test.tsx src/features/app/hooks/useWorktreeSetupStatusMap.test.tsx src/features/app/hooks/useMainAppLayoutSurfaces.test.tsx
```

Expected: shared sidebar coverage passes.

## Task 3: Update Docs And Run Full Verification

**Files:**

- Modify: `docs/web-desktop-parity.md`

- [ ] **Step 1: Update the live parity doc**

Document that shared web/desktop workflows now include read-only worktree setup status visibility when `operations.worktreeSetupStatus` is available, and remove the old desktop-only status line.

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
git add docs/superpowers/specs/2026-04-22-web-parity-worktree-setup-status-design.md \
  docs/superpowers/plans/2026-04-22-web-parity-worktree-setup-status.md \
  docs/web-desktop-parity.md \
  src-tauri/src/shared/web_runtime_capabilities.rs \
  src-tauri/src/bin/codex_monitor_web_bridge/routes.rs \
  src/services/bridge/http.ts \
  src/services/tauri.ts \
  src/features/app/hooks/useWebRuntimeCapabilities.ts \
  src/features/app/hooks/useWorktreeSetupStatusMap.ts \
  src/features/app/hooks/useWorktreeSetupStatusMap.test.tsx \
  src/features/app/components/MainApp.tsx \
  src/features/app/hooks/useMainAppLayoutSurfaces.ts \
  src/features/app/components/Sidebar.tsx \
  src/features/app/components/SidebarWorkspaceGroups.tsx \
  src/features/app/components/WorktreeSection.tsx \
  src/features/app/components/WorktreeCard.tsx \
  src/styles/sidebar.css
git commit -m "feat: add web worktree setup status visibility"
```

Expected: one clean commit containing the worktree setup status slice.
