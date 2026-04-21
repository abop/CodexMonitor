# Web Parity Worktree Setup Status Design

## Summary

This document defines a narrow `Phase 2C` slice for the web build: expose read-only worktree setup-script status in the shared sidebar so browser users can tell whether a remote worktree still has a pending environment setup step.

The slice reuses the existing shared `worktree_setup_status` backend path, routes it through the web bridge as a read-only capability, and renders a small status pill in shared worktree cards without adding any browser write path.

## Problem

CodexMonitor already has:

- shared backend logic for `worktree_setup_status`
- desktop worktree setup marker tracking
- a shared sidebar surface where worktrees are already listed

But the web build still hides the status because `getWorktreeSetupStatus()` is desktop-gated and the bridge does not advertise or forward the read method.

That leaves a visibility gap:

- browser users can inspect setup scripts in `Settings -> Environments`
- they still cannot tell which existing worktrees have a pending setup launch
- support/debugging for remote worktrees still requires desktop or shell access for a read-only question

## Goals

- Expose read-only worktree setup status in web runtime.
- Reuse the existing shared backend method instead of adding a new payload shape.
- Surface the result in existing shared sidebar worktree cards.
- Keep the browser strictly read-only for this workflow.

## Non-Goals

- No web support for `worktree_setup_mark_ran`.
- No web support for launching setup scripts or opening terminal sessions.
- No worktree creation or setup-script editing changes in this slice.
- No new settings section or standalone worktree diagnostics panel.

## Constraints

- The backend marker means the setup script has been launched once, not that it completed successfully.
- The UI wording must avoid implying script success.
- The shared desktop experience should remain valid and can reuse the same indicator.
- Capability reporting should stay explicit so unsupported bridges fail closed.

## Proposed Approach

### Bridge and capability model

- Add `worktree_setup_status` to the web bridge allowlist.
- Advertise the read path as `operations.worktreeSetupStatus`.
- Route `getWorktreeSetupStatus()` through `invokeSupportedRpc()` so web runtime uses the bridge and desktop keeps using the normal command path.

### Shared sidebar rendering

- Add a small capability-aware hook that fetches `worktree_setup_status` for current worktree entries only.
- Map backend status to two read-only labels:
  - `Setup pending`
  - `Setup launched`
- Render the label in `WorktreeCard` only when a setup script exists.
- Hide the indicator entirely when the capability is unavailable or the worktree has no setup script.

### Refresh behavior

- Fetch on worktree list or script-setting changes.
- Clear cached status state when capability support disappears.
- Refresh once after desktop worktree creation finishes its auto-launch attempt so new worktrees do not stay stale.

## Why This Approach

This is the lowest-risk remaining environment-visibility slice:

- the shared backend method already exists
- the browser only gets a read path
- the UI fits naturally into an existing shared surface
- it closes a real remote-debugging gap without introducing file mutation or shell control

## File Impact

Modify:

- `src-tauri/src/shared/web_runtime_capabilities.rs`
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- `src/services/bridge/http.ts`
- `src/services/tauri.ts`
- `src/features/app/hooks/useWebRuntimeCapabilities.ts`
- `src/features/app/components/MainApp.tsx`
- `src/features/app/hooks/useMainAppLayoutSurfaces.ts`
- `src/features/app/components/Sidebar.tsx`
- `src/features/app/components/SidebarWorkspaceGroups.tsx`
- `src/features/app/components/WorktreeSection.tsx`
- `src/features/app/components/WorktreeCard.tsx`
- `src/styles/sidebar.css`
- `docs/web-desktop-parity.md`

Create:

- `src/features/app/hooks/useWorktreeSetupStatusMap.ts`

## Testing Strategy

- Add failing bridge tests for capability advertising and RPC forwarding.
- Add failing service tests for web routing of `getWorktreeSetupStatus()`.
- Add failing shared UI tests for worktree setup labels.
- Add a hook test covering worktree-only fetches, capability-off cache clearing, and manual refresh.
- Run targeted tests first, then full `npm run test`, `npm run typecheck`, `cargo check`, `cargo test --bin codex_monitor_web_bridge`, and `git diff --check`.

## Success Criteria

This slice is complete when:

- web bridges can advertise and forward `worktree_setup_status`
- shared sidebar worktree cards show `Setup pending` or `Setup launched` when appropriate
- no browser write path is added
- live parity docs describe the new shared read-only worktree setup visibility accurately
