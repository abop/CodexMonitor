# Web Parity Usage Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first `Phase 3` web diagnostics slice by exposing `local_usage_snapshot` through the web bridge and wiring the shared home usage panel to fetch it only when the runtime advertises support.

**Architecture:** Reuse the existing daemon and shared local-usage RPC shape instead of introducing a browser-specific transport. Extend the bridge capability catalog with the read-only `usageSnapshot` operation flag, route `localUsageSnapshot()` through `invokeSupportedRpc()` so desktop and web share one transport path, and make the home usage hook capability-aware so unsupported runtimes do not issue requests or retain stale usage state.

**Tech Stack:** Rust, Axum, shared Tauri modules, React, TypeScript, Vitest, existing daemon JSON-RPC bridge.

---

## Scope Split

This plan covers only the `local_usage_snapshot` portion of `Phase 3` from `docs/superpowers/specs/2026-04-21-web-parity-roadmap-design.md`.

Included:

- bridge allowlisting for the existing `local_usage_snapshot` RPC
- capability advertisement for `operations.usageSnapshot`
- web service routing for `localUsageSnapshot()`
- home usage polling that only runs when runtime capability is available
- stale usage-state clearing when the capability is turned off

Excluded:

- `codex_doctor`
- experimental feature visibility or mutation
- new home empty states or broader capability messaging
- any mutating operational controls

## File Structure

Modify:

- `src-tauri/src/shared/web_runtime_capabilities.rs` - advertise bridge support for read-only usage snapshots.
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` - route tests for usage capability advertising and RPC forwarding.
- `src/services/tauri.ts` - route `localUsageSnapshot()` through `invokeSupportedRpc()`.
- `src/services/tauri.test.ts` - verify web routing for the usage snapshot helper.
- `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx` - confirm the fetched capability can turn on `operations.usageSnapshot`.
- `src/features/app/orchestration/useWorkspaceOrchestration.ts` - pass runtime capability into the home usage hook.
- `src/features/home/hooks/useLocalUsage.ts` - clear stale usage state when polling is disabled.
- `src/features/home/hooks/useLocalUsage.test.tsx` - cover disabled-state clearing and existing polling behavior.

No new runtime modules are required for this slice.

### Task 1: Expose `local_usage_snapshot` Through The Bridge

**Files:**

- Modify: `src-tauri/src/shared/web_runtime_capabilities.rs`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- Modify: `src/services/tauri.ts`
- Modify: `src/services/tauri.test.ts`

- [ ] **Step 1: Add failing bridge tests for usage capability and forwarding**

Extend `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` with route tests for the new read-only operations slice:

```rust
#[test]
fn advertises_usage_snapshot_operation_support() {
    let capabilities = bridge_capabilities_v1();
    let methods = capabilities.methods;

    assert!(capabilities.operations.usage_snapshot);
    assert!(methods.contains(&"local_usage_snapshot"));
}

#[test]
fn forwards_local_usage_snapshot_requests() {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime")
        .block_on(async {
            let (client, mut server) = test_client_pair().await;
            let params = json!({
                "days": 30,
                "workspacePath": "/srv/app"
            });
            server
                .enqueue_result(1, json!({ "updatedAt": 0, "days": [], "totals": {}, "topModels": [] }))
                .await;
            let app = build_router(test_state_with_client(client));
            let response = app
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/rpc")
                        .header("content-type", "application/json")
                        .header("cf-access-jwt-assertion", "present")
                        .body(Body::from(
                            json!({ "method": "local_usage_snapshot", "params": params }).to_string(),
                        ))
                        .unwrap(),
                )
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(server.last_method().await, "local_usage_snapshot");
            assert_eq!(server.last_params().await, params);
        });
}
```

Run:

```bash
cd src-tauri
cargo test --bin codex_monitor_web_bridge \
  routes::tests::advertises_usage_snapshot_operation_support \
  routes::tests::forwards_local_usage_snapshot_requests
```

Expected: both tests fail because the bridge still reports `usage_snapshot: false` and blocks the method.

- [ ] **Step 2: Advertise the read-only usage snapshot operation**

Update `src-tauri/src/shared/web_runtime_capabilities.rs` so the bridge allowlist and operation flags expose only the safe usage slice:

```rust
    "get_app_settings",
    "update_app_settings",
    "local_usage_snapshot",
    "get_config_model",
```

And enable just the usage flag in `bridge_capabilities_v1()`:

```rust
        operations: OperationsCapabilities {
            usage_snapshot: true,
            doctor_report: false,
            feature_flags: false,
        },
```

Do not enable doctor or feature-flag operations in this batch.

- [ ] **Step 3: Add failing web service coverage for `localUsageSnapshot()`**

Extend `src/services/tauri.test.ts` with a web-runtime assertion:

```ts
it("routes localUsageSnapshot through bridgeRpc in web runtime", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://bridge.example.com");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          updatedAt: 123,
          days: [],
          totals: {
            last7DaysTokens: 0,
            last30DaysTokens: 0,
            averageDailyTokens: 0,
            cacheHitRatePercent: 0,
            peakDay: null,
            peakDayTokens: 0,
          },
          topModels: [],
        },
      }),
    }),
  );

  await expect(localUsageSnapshot(30, "/srv/app")).resolves.toMatchObject({
    updatedAt: 123,
  });

  expect(fetch).toHaveBeenCalledWith(
    "https://bridge.example.com/api/rpc",
    expect.objectContaining({
      body: JSON.stringify({
        method: "local_usage_snapshot",
        params: { days: 30, workspacePath: "/srv/app" },
      }),
    }),
  );
});
```

Run:

```bash
npm run test -- src/services/tauri.test.ts
```

Expected: the new test fails because `localUsageSnapshot()` still requires desktop runtime.

- [ ] **Step 4: Route `localUsageSnapshot()` through `invokeSupportedRpc()`**

Update `src/services/tauri.ts` so the wrapper uses the shared bridge/desktop transport:

```ts
export async function localUsageSnapshot(
  days?: number,
  workspacePath?: string | null,
): Promise<LocalUsageSnapshot> {
  const payload: { days: number; workspacePath?: string } = { days: days ?? 30 };
  if (workspacePath) {
    payload.workspacePath = workspacePath;
  }
  return invokeSupportedRpc("local_usage_snapshot", payload);
}
```

Keep the existing payload shape unchanged so both desktop and daemon callers stay compatible.

- [ ] **Step 5: Run targeted bridge and service tests**

Run:

```bash
cd src-tauri && cargo test --bin codex_monitor_web_bridge
npm run test -- src/services/tauri.test.ts
```

Expected: the new bridge and service tests pass.

### Task 2: Make Home Usage Polling Capability-Aware

**Files:**

- Modify: `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx`
- Modify: `src/features/app/orchestration/useWorkspaceOrchestration.ts`
- Modify: `src/features/home/hooks/useLocalUsage.ts`
- Modify: `src/features/home/hooks/useLocalUsage.test.tsx`

- [ ] **Step 1: Add failing tests for usage capability plumbing**

Extend `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx` so the web hook proves it can surface `operations.usageSnapshot: true`:

```ts
await waitFor(() =>
  expect(result.current.operations).toEqual({
    usageSnapshot: true,
    doctorReport: false,
    featureFlags: false,
  }),
);
```

Then extend `src/features/home/hooks/useLocalUsage.test.tsx` with a disabled-state regression test:

```ts
it("clears stale snapshot state when polling is disabled", async () => {
  const localUsageSnapshotMock = vi.mocked(localUsageSnapshot);
  localUsageSnapshotMock.mockResolvedValue(makeSnapshot(7));

  const { result, rerender } = renderHook(
    ({ enabled }) => useLocalUsage(enabled, "/tmp/codex"),
    { initialProps: { enabled: true } },
  );

  await act(async () => {
    await Promise.resolve();
  });

  expect(result.current.snapshot?.updatedAt).toBe(7);

  rerender({ enabled: false });

  expect(result.current.snapshot).toBeNull();
  expect(result.current.error).toBeNull();
  expect(result.current.isLoading).toBe(false);
});
```

Run:

```bash
npm run test -- \
  src/features/app/hooks/useWebRuntimeCapabilities.test.tsx \
  src/features/home/hooks/useLocalUsage.test.tsx
```

Expected: the `operations` assertion fails first, and the disabled-state test fails because the hook currently retains stale data.

- [ ] **Step 2: Thread runtime support into the home usage orchestration**

Update `src/features/app/orchestration/useWorkspaceOrchestration.ts` so the insights hook accepts and uses a dedicated capability boolean:

```ts
type UseWorkspaceInsightsOrchestrationOptions = {
  // existing fields...
  usageSnapshotEnabled: boolean;
};
```

Use it when wiring the home polling hook:

```ts
  const {
    snapshot: localUsageSnapshot,
    isLoading: isLoadingLocalUsage,
    error: localUsageError,
    refresh: refreshLocalUsage,
  } = useLocalUsage(showHome && usageSnapshotEnabled, usageWorkspacePath);
```

Update the `MainApp.tsx` callsite to pass `runtimeCapabilities.operations.usageSnapshot`.

- [ ] **Step 3: Clear stale local-usage state when polling is disabled**

Update the `enabled` effect in `src/features/home/hooks/useLocalUsage.ts` so capability loss or leaving the home view resets the hook back to the empty state:

```ts
  useEffect(() => {
    enabledRef.current = enabled;
    requestIdRef.current += 1;
    inFlightRef.current = null;
    pendingRefreshRef.current = false;
    if (!enabled) {
      setState(emptyState);
    }
  }, [enabled]);
```

Keep the existing request-id invalidation so late results are ignored after the hook is disabled.

- [ ] **Step 4: Run the targeted frontend tests**

Run:

```bash
npm run test -- \
  src/features/app/hooks/useWebRuntimeCapabilities.test.tsx \
  src/features/home/hooks/useLocalUsage.test.tsx \
  src/services/tauri.test.ts
```

Expected: all targeted frontend tests pass.

### Task 3: Verification And Documentation Sync

**Files:**

- Modify: `docs/web-desktop-parity.md`

- [ ] **Step 1: Update the parity doc to remove the home-usage gap**

Change the current desktop-only wording in `docs/web-desktop-parity.md` so it reflects the live state after this slice:

```md
- Local usage snapshot on the home view is available when the connected web bridge advertises `operations.usageSnapshot`.
```

And remove the shared-UI gap that said home usage still depends on a desktop-only command.

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

- [ ] **Step 3: Commit the slice cleanly**

Run:

```bash
git add \
  docs/web-desktop-parity.md \
  docs/superpowers/plans/2026-04-21-web-parity-usage-snapshot.md \
  src-tauri/src/shared/web_runtime_capabilities.rs \
  src-tauri/src/bin/codex_monitor_web_bridge/routes.rs \
  src/services/tauri.ts \
  src/services/tauri.test.ts \
  src/features/app/hooks/useWebRuntimeCapabilities.test.tsx \
  src/features/app/orchestration/useWorkspaceOrchestration.ts \
  src/features/home/hooks/useLocalUsage.ts \
  src/features/home/hooks/useLocalUsage.test.tsx
git commit -m "feat: add web usage snapshot parity"
```

Expected: one clean commit containing the Phase 3A bridge, frontend, and doc updates.
