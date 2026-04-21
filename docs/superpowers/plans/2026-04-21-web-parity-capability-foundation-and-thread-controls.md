# Web Parity Capability Foundation And Thread Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bridge-backed web capability model and ship web support for `Steer`, thread fork, and thread compact without exposing broken controls in shared UI.

**Architecture:** Move the web bridge method allowlist into a shared Rust capability catalog, expose a small bridge capability document to the frontend, and stop duplicating the bridge-supported method list in `src/services/tauri.ts`. Use that capability document to gate browser affordances for thread controls while routing `turn_steer`, `fork_thread`, and `compact_thread` through the existing daemon RPC path.

**Tech Stack:** Rust, Axum, Tauri shared modules, React, TypeScript, Vite, Vitest, existing daemon TCP RPC, web bridge HTTP/WebSocket transport.

---

## Scope Split

This plan intentionally covers only the first executable slice from the roadmap:

- Phase 0 minimum foundation needed for capability-aware web behavior.
- Phase 1A advanced thread workflows: `Steer`, `fork_thread`, and `compact_thread`.

This plan does not include:

- `start_review` or detached review parity
- `list_mcp_server_status`
- remote file or environment visibility
- operational diagnostics

Those should be separate follow-on plans so each implementation batch stays testable and independently releasable.

## File Structure

Create:

- `src-tauri/src/shared/web_runtime_capabilities.rs` - shared source of truth for bridge-exposed methods, capability categories, and serializable payloads returned to the frontend.
- `src/features/app/hooks/useWebRuntimeCapabilities.ts` - web-only fetch/caching hook for the bridge capability document with safe desktop defaults.
- `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx` - hook coverage for loading, fallback, bridge-URL changes, and failure behavior.

Modify:

- `src-tauri/src/shared/mod.rs` - export the shared capability module.
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` - replace the local RPC allowlist with the shared capability catalog and add a bridge capability endpoint.
- `src/services/bridge/http.ts` - add a typed bridge capability fetch helper alongside `bridgeRpc`.
- `src/services/bridge/http.test.ts` - cover the capability fetch helper and malformed capability responses.
- `src/services/tauri.ts` - remove the duplicated web RPC allowlist guard for bridge-backed methods and route `forkThread`, `compactThread`, and `steerTurn` through `invokeSupportedRpc`.
- `src/services/tauri.test.ts` - cover web-runtime routing for `forkThread`, `compactThread`, and `steerTurn`.
- `src/features/app/components/MainApp.tsx` - load bridge capability state once and thread it into composer-related state.
- `src/features/app/hooks/useMainAppComposerWorkspaceState.ts` - make `steerAvailable` depend on both active turn state and runtime capability support.
- `src/features/composer/components/Composer.tsx` - pass runtime command-capability flags into the autocomplete hook used by the main composer surface.
- `src/features/composer/hooks/useComposerAutocompleteState.ts` - filter slash-command suggestions based on the runtime capability document.
- `src/features/composer/hooks/useComposerAutocompleteState.test.tsx` - cover command filtering for supported and unsupported bridge capabilities.
- `src/features/workspaces/components/WorkspaceHome.tsx` - pass command capability flags into the workspace-home composer autocomplete surface.
- `src/features/workspaces/components/WorkspaceHome.test.tsx` - keep workspace-home slash suggestion behavior covered after the new autocomplete argument is added.
- `src/features/threads/hooks/useThreads.integration.test.tsx` - cover the web-thread control happy path using bridge-backed `steerTurn`.

## Capability Payload

Use a minimal payload that is explicit enough for current UI consumers and extensible for later phases.

```json
{
  "version": 1,
  "methods": ["list_workspaces", "turn_steer", "fork_thread", "compact_thread"],
  "threadControls": {
    "steer": true,
    "fork": true,
    "compact": true,
    "review": false,
    "mcp": false
  },
  "files": {
    "workspaceTree": false,
    "workspaceAgents": false,
    "globalAgents": false,
    "globalConfig": false
  },
  "operations": {
    "usageSnapshot": false,
    "doctorReport": false,
    "featureFlags": false
  }
}
```

The first batch only needs `threadControls.steer`, `threadControls.fork`, and `threadControls.compact` in the frontend, but the payload should include placeholders for later roadmap phases so the shape does not churn immediately after release.

### Task 1: Create The Shared Bridge Capability Catalog

**Files:**

- Create: `src-tauri/src/shared/web_runtime_capabilities.rs`
- Modify: `src-tauri/src/shared/mod.rs`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`

- [ ] Add failing Rust route tests in `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` for:
  - `GET /api/capabilities` returns a JSON payload with `version`, `methods`, and `threadControls`.
  - `POST /api/rpc` allows `turn_steer`, `fork_thread`, and `compact_thread`.
  - `GET /api/capabilities` still reports file and operations capabilities as `false`.

- [ ] Introduce `src-tauri/src/shared/web_runtime_capabilities.rs` with:
  - a serializable `WebRuntimeCapabilities` struct
  - a serializable `ThreadControlCapabilities` struct
  - serializable `FileCapabilities` and `OperationsCapabilities` structs
  - `pub(crate) fn bridge_capabilities_v1() -> WebRuntimeCapabilities`
  - `pub(crate) fn bridge_all_allowed_rpc_methods() -> &'static [&'static str]`

- [ ] Populate the initial allowed method list in the shared module by moving the current bridge allowlist out of `routes.rs` and adding:
  - `turn_steer`
  - `fork_thread`
  - `compact_thread`

- [ ] Keep file and operations capability flags set to `false` in this batch even though the payload already reserves those sections.

- [ ] Replace the local `ALLOWED_RPC_METHODS` constant in `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` with the shared helper and add a new `GET /api/capabilities` route that returns the shared payload without contacting the daemon.

- [ ] Run targeted Rust tests:

```bash
cd src-tauri
cargo test --bin codex_monitor_web_bridge routes::tests::returns_bridge_capabilities routes::tests::forwards_thread_control_requests
```

Expected:

- both new tests pass
- existing bridge route tests stay green

- [ ] Commit:

```bash
git add src-tauri/src/shared/mod.rs src-tauri/src/shared/web_runtime_capabilities.rs src-tauri/src/bin/codex_monitor_web_bridge/routes.rs
git commit -m "feat: add bridge runtime capability catalog"
```

### Task 2: Route Thread Controls Through Bridge RPC

**Files:**

- Modify: `src/services/bridge/http.ts`
- Modify: `src/services/bridge/http.test.ts`
- Modify: `src/services/tauri.ts`
- Modify: `src/services/tauri.test.ts`

- [ ] Add failing frontend service tests for:
  - `fetchBridgeCapabilities()` reading `/api/capabilities`
  - `forkThread()` using bridge RPC in web runtime
  - `compactThread()` using bridge RPC in web runtime
  - `steerTurn()` using bridge RPC in web runtime and still preserving image normalization

- [ ] Add a typed helper in `src/services/bridge/http.ts`:

```ts
export type WebRuntimeCapabilities = {
  version: 1;
  methods: string[];
  threadControls: {
    steer: boolean;
    fork: boolean;
    compact: boolean;
    review: boolean;
    mcp: boolean;
  };
  files: {
    workspaceTree: boolean;
    workspaceAgents: boolean;
    globalAgents: boolean;
    globalConfig: boolean;
  };
  operations: {
    usageSnapshot: boolean;
    doctorReport: boolean;
    featureFlags: boolean;
  };
};

export async function fetchBridgeCapabilities(
  config: BridgeConfig,
): Promise<WebRuntimeCapabilities> {
  const response = await fetch(`${config.baseUrl}/api/capabilities`, {
    method: "GET",
    credentials: "include",
  });
  const payload = (await response.json()) as WebRuntimeCapabilities;
  return payload;
}
```

- [ ] Remove the static `WEB_SUPPORTED_RPC_METHODS` duplication from `src/services/tauri.ts` and make `invokeSupportedRpc()` call `bridgeRpc()` directly in web runtime. Keep `requireDesktopRuntime()` only for intentionally desktop-only features such as dialogs, tray, updater, local editors, and terminal.

- [ ] Update these service wrappers to use `invokeSupportedRpc()` instead of `requireDesktopRuntime()` + `invoke()`:
  - `forkThread`
  - `compactThread`
  - `steerTurn`

- [ ] Keep `startReview()` and `listMcpServerStatus()` desktop-gated in this batch even though the shared capability payload already includes `review` and `mcp` flags.

- [ ] Run targeted frontend tests:

```bash
npm run test -- src/services/bridge/http.test.ts src/services/tauri.test.ts
```

Expected:

- the new capability fetch test passes
- the three thread-control service tests pass in web runtime

- [ ] Commit:

```bash
git add src/services/bridge/http.ts src/services/bridge/http.test.ts src/services/tauri.ts src/services/tauri.test.ts
git commit -m "feat: bridge web thread controls through rpc"
```

### Task 3: Add Runtime Capability State To Shared UI

**Files:**

- Create: `src/features/app/hooks/useWebRuntimeCapabilities.ts`
- Create: `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx`
- Modify: `src/features/app/components/MainApp.tsx`
- Modify: `src/features/app/hooks/useMainAppComposerWorkspaceState.ts`
- Modify: `src/features/composer/components/Composer.tsx`
- Modify: `src/features/composer/hooks/useComposerAutocompleteState.ts`
- Modify: `src/features/composer/hooks/useComposerAutocompleteState.test.tsx`
- Modify: `src/features/workspaces/components/WorkspaceHome.tsx`
- Modify: `src/features/workspaces/components/WorkspaceHome.test.tsx`

- [ ] Add failing tests for `useWebRuntimeCapabilities()` covering:
  - desktop returns a local “fully supported for current slice” default without fetch
  - web fetches capabilities from the current bridge URL
  - web resets to a safe fallback when the bridge URL changes
  - web keeps `steer`, `fork`, and `compact` false on fetch failure

- [ ] Implement `useWebRuntimeCapabilities()` so it:
  - returns immediate desktop defaults
  - fetches `/api/capabilities` only in web runtime
  - re-runs when `subscribeRuntimeBridgeBaseUrl()` reports a bridge change
  - exposes a stable object with booleans safe for rendering before the first request completes

- [ ] Thread the hook result through `src/features/app/components/MainApp.tsx` into `useMainAppComposerWorkspaceState.ts`.

- [ ] Change `steerAvailable` in `src/features/app/hooks/useMainAppComposerWorkspaceState.ts` to require:
  - `settings.steerEnabled`
  - `Boolean(activeTurnId)`
  - `runtimeCapabilities.threadControls.steer`

- [ ] Extend `useComposerAutocompleteState.ts` with a new argument such as:

```ts
commandCapabilities?: {
  fork: boolean;
  compact: boolean;
  review: boolean;
  mcp: boolean;
};
```

Use it to filter unsupported slash-command items before the list is sorted. In this batch:

- hide `fork` when `fork` is false
- hide `compact` when `compact` is false
- leave `review` and `mcp` hidden for web defaults because those capabilities stay false until follow-on plans land

- [ ] Update `src/features/composer/components/Composer.tsx`, `src/features/workspaces/components/WorkspaceHome.tsx`, and any other callsites of `useComposerAutocompleteState()` so the command capability object is passed through both main-composer and workspace-home surfaces.

- [ ] Run targeted frontend tests:

```bash
npm run test -- src/features/app/hooks/useWebRuntimeCapabilities.test.tsx src/features/composer/hooks/useComposerAutocompleteState.test.tsx src/features/workspaces/components/WorkspaceHome.test.tsx
```

Expected:

- desktop tests use defaults with no fetch
- web tests show filtered slash commands before capabilities load
- slash commands update after capability fetch resolves

- [ ] Commit:

```bash
git add src/features/app/components/MainApp.tsx src/features/app/hooks/useWebRuntimeCapabilities.ts src/features/app/hooks/useWebRuntimeCapabilities.test.tsx src/features/app/hooks/useMainAppComposerWorkspaceState.ts src/features/composer/components/Composer.tsx src/features/composer/hooks/useComposerAutocompleteState.ts src/features/composer/hooks/useComposerAutocompleteState.test.tsx src/features/workspaces/components/WorkspaceHome.tsx src/features/workspaces/components/WorkspaceHome.test.tsx
git commit -m "feat: gate web composer controls by bridge capabilities"
```

### Task 4: Verify End-To-End Thread Control Behavior

**Files:**

- Modify: `src/features/threads/hooks/useThreads.integration.test.tsx`
- Verify only: files from Tasks 1-3

- [ ] Add or update integration coverage in `src/features/threads/hooks/useThreads.integration.test.tsx` for:
  - web `sendUserMessage()` using `steerTurn()` when the active turn remains in progress
  - bridge-backed `forkThread()` returning a new thread that becomes resumable
  - bridge-backed `compactThread()` no longer surfacing the desktop-only error path

- [ ] Run focused tests for thread behavior:

```bash
npm run test -- src/features/threads/hooks/useThreads.integration.test.tsx src/features/threads/hooks/useThreadActions.test.tsx
```

Expected:

- existing thread orchestration tests still pass
- no web-runtime desktop-only error strings remain for `Steer`, `fork`, or `compact`

- [ ] Run full validation for the slice:

```bash
npm run test
npm run typecheck
cd src-tauri && cargo check
```

Expected:

- frontend tests pass
- TypeScript passes with no emit
- Rust backend compiles cleanly

- [ ] Manual verification:
  - start the daemon and web bridge locally
  - open the web build with a configured bridge URL
  - confirm `Queue`/`Steer` only enables once a turn is active and the capability payload reports `steer: true`
  - confirm `/fork` and `/compact` appear in slash autocomplete
  - confirm `/fork continue this path` opens the forked thread and sends the remainder text
  - confirm `/compact` no longer throws “unavailable in the web build”

- [ ] Commit the final integration batch:

```bash
git add src/features/threads/hooks/useThreads.integration.test.tsx
git commit -m "test: cover web thread control parity"
```

## Follow-On Plans

After this plan ships, the next plans should be written separately for:

1. Phase 1B review and MCP parity.
2. Phase 2 read-only files and environment visibility.
3. Phase 3 read-only operations and diagnostics.
