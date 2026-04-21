# Web Parity Review And MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bridge-backed web support for `start_review` and `list_mcp_server_status`, surface those capabilities in shared UI, and keep non-composer review entry points aligned with the same runtime gating.

**Architecture:** Extend the shared Rust bridge capability catalog so review and MCP support come from one source of truth, then route the frontend service wrappers through `invokeSupportedRpc()` in web runtime without creating web-only review or MCP code paths. Reuse the existing review-thread lifecycle and MCP summary rendering already owned by `useThreadMessaging`, and only add capability-aware UI gating where shared surfaces can otherwise expose a dead button.

**Tech Stack:** Rust, Axum, Tauri shared modules, React, TypeScript, Vitest, daemon TCP RPC, bridge HTTP transport.

---

## Scope Split

This plan covers only `Phase 1B` from `docs/superpowers/specs/2026-04-21-web-parity-roadmap-design.md`:

- generic `start_review` flows for working tree, base branch, and commit reviews
- detached review-thread lifecycle through the existing shared thread hooks
- `list_mcp_server_status` summary visibility through the existing `/mcp` command path
- shared UI gating so browser users only see the uncommitted-review action when review support is actually available

This plan does not cover:

- GitHub pull-request review helpers in `src/features/git/hooks/usePullRequestReviewActions.ts`
- remote file or environment work
- operational diagnostics
- any new write scope beyond the already-existing review RPC

## File Structure

Modify:

- `src-tauri/src/shared/web_runtime_capabilities.rs` - bridge capability source of truth for review and MCP support.
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` - bridge route tests that assert the new allowlist and advertised capabilities.
- `src/services/tauri.ts` - web-safe routing for `startReview()` and `listMcpServerStatus()`.
- `src/services/tauri.test.ts` - desktop and web transport coverage for the two service wrappers.
- `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx` - hook expectations for fetched review and MCP capability flags.
- `src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx` - composer command capability assertions for `review` and `mcp`.
- `src/features/app/hooks/useMainAppLayoutSurfaces.ts` - gate the Git diff "Review uncommitted changes" entry point on runtime review capability.
- `src/features/git/components/GitDiffPanel.test.tsx` - verify the uncommitted-review button appears only when the callback is supplied.
- `src/features/threads/hooks/useThreadMessaging.test.tsx` - MCP summary rendering and failure fallback coverage.
- `src/features/threads/hooks/useThreads.integration.test.tsx` - integration coverage for the uncommitted-review path through the shared thread hook.

No new files are required for this slice.

### Task 1: Extend The Shared Bridge Capability Catalog

**Files:**

- Modify: `src-tauri/src/shared/web_runtime_capabilities.rs`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`

- [ ] **Step 1: Add failing Rust tests for review and MCP bridge support**

Update `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` so the route tests assert the new capability/method pairing and daemon forwarding:

```rust
#[test]
fn advertised_thread_controls_have_matching_methods() {
    let capabilities = bridge_capabilities_v1();
    let methods = capabilities.methods;

    assert!(capabilities.thread_controls.review);
    assert!(methods.contains(&"start_review"));
    assert!(capabilities.thread_controls.mcp);
    assert!(methods.contains(&"list_mcp_server_status"));
}

#[test]
fn forwards_review_and_mcp_requests() {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime")
        .block_on(async {
            let requests = [
                (
                    "start_review",
                    json!({
                        "workspaceId": "ws-1",
                        "threadId": "thread-1",
                        "target": { "type": "uncommittedChanges" },
                        "delivery": "detached"
                    }),
                ),
                (
                    "list_mcp_server_status",
                    json!({
                        "workspaceId": "ws-1",
                        "cursor": null,
                        "limit": null
                    }),
                ),
            ];

            for (method, params) in requests {
                let (client, mut server) = test_client_pair().await;
                server.enqueue_result(1, json!({})).await;
                let app = build_router(test_state_with_client(client));
                let response = app
                    .oneshot(
                        Request::builder()
                            .method("POST")
                            .uri("/api/rpc")
                            .header("content-type", "application/json")
                            .header("cf-access-jwt-assertion", "present")
                            .body(Body::from(
                                json!({ "method": method, "params": params }).to_string(),
                            ))
                            .unwrap(),
                    )
                    .await
                    .unwrap();

                assert_eq!(response.status(), StatusCode::OK, "{method} should be allowed");
                assert_eq!(server.last_method().await, method);
                assert_eq!(server.last_params().await, params);
            }
        });
}
```

Run: `cd src-tauri && cargo test --bin codex_monitor_web_bridge routes::tests::advertised_thread_controls_have_matching_methods routes::tests::forwards_review_and_mcp_requests`

Expected: both tests fail because `start_review` and `list_mcp_server_status` are not yet advertised.

- [ ] **Step 2: Add review and MCP support to the shared capability document**

Update `src-tauri/src/shared/web_runtime_capabilities.rs` so the shared allowlist and serialized capability payload both expose the new slice.

Insert these exact method lines inside `BRIDGE_ALLOWED_RPC_METHODS` immediately after `"compact_thread"`:

```rust
    "turn_steer",
    "fork_thread",
    "compact_thread",
    "start_review",
    "list_mcp_server_status",
    "thread_live_subscribe",
```

Then set the capability booleans in `bridge_capabilities_v1()` like this:

```rust
pub(crate) fn bridge_capabilities_v1() -> WebRuntimeCapabilities {
    WebRuntimeCapabilities {
        version: 1,
        methods: bridge_all_allowed_rpc_methods().to_vec(),
        thread_controls: ThreadControlCapabilities {
            steer: true,
            fork: true,
            compact: true,
            review: true,
            mcp: true,
        },
        files: FileCapabilities {
            workspace_tree: false,
            workspace_agents: false,
            global_agents: false,
            global_config: false,
        },
        operations: OperationsCapabilities {
            usage_snapshot: false,
            doctor_report: false,
            feature_flags: false,
        },
    }
}
```

No route logic change is needed beyond continuing to consume `bridge_all_allowed_rpc_methods()` and `bridge_capabilities_v1()` from the shared module.

- [ ] **Step 3: Run the targeted bridge tests**

Run:

```bash
cd src-tauri
cargo test --bin codex_monitor_web_bridge \
  routes::tests::returns_bridge_capabilities \
  routes::tests::advertised_thread_controls_have_matching_methods \
  routes::tests::forwards_review_and_mcp_requests
```

Expected:

- `returns_bridge_capabilities` passes with `review: true` and `mcp: true`
- the new allowlist test passes
- the new forwarding test passes

- [ ] **Step 4: Commit the bridge capability change**

Run:

```bash
git add src-tauri/src/shared/web_runtime_capabilities.rs src-tauri/src/bin/codex_monitor_web_bridge/routes.rs
git commit -m "feat: advertise web review and mcp capabilities"
```

### Task 2: Route Review And MCP Service Calls Through The Bridge

**Files:**

- Modify: `src/services/tauri.ts`
- Modify: `src/services/tauri.test.ts`

- [ ] **Step 1: Add failing frontend service tests for the web path**

Extend `src/services/tauri.test.ts` with explicit web-runtime assertions for `startReview()` and `listMcpServerStatus()`:

```ts
it("routes startReview through bridgeRpc in web runtime", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://bridge.example.com");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { reviewThreadId: "thread-review-1" } }),
    }),
  );

  await startReview(
    "ws-5",
    "thread-2",
    { type: "uncommittedChanges" },
    "detached",
  );

  expect(fetch).toHaveBeenCalledWith(
    "https://bridge.example.com/api/rpc",
    expect.objectContaining({
      body: JSON.stringify({
        method: "start_review",
        params: {
          workspaceId: "ws-5",
          threadId: "thread-2",
          target: { type: "uncommittedChanges" },
          delivery: "detached",
        },
      }),
    }),
  );
});

it("routes listMcpServerStatus through bridgeRpc in web runtime", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://bridge.example.com");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: [] } }),
    }),
  );

  await listMcpServerStatus("ws-10", "cursor-1", 25);

  expect(fetch).toHaveBeenCalledWith(
    "https://bridge.example.com/api/rpc",
    expect.objectContaining({
      body: JSON.stringify({
        method: "list_mcp_server_status",
        params: {
          workspaceId: "ws-10",
          cursor: "cursor-1",
          limit: 25,
        },
      }),
    }),
  );
});
```

Run: `npm run test -- src/services/tauri.test.ts`

Expected: the new web-runtime assertions fail because both wrappers are still desktop-gated.

- [ ] **Step 2: Switch the two wrappers to `invokeSupportedRpc()`**

Update `src/services/tauri.ts` so the payload shape stays the same while the transport becomes bridge-capable:

```ts
export async function startReview(
  workspaceId: string,
  threadId: string,
  target: ReviewTarget,
  delivery?: "inline" | "detached",
) {
  const payload: Record<string, unknown> = { workspaceId, threadId, target };
  if (delivery) {
    payload.delivery = delivery;
  }
  return invokeSupportedRpc("start_review", payload);
}

export async function listMcpServerStatus(
  workspaceId: string,
  cursor?: string | null,
  limit?: number | null,
) {
  return invokeSupportedRpc<any>("list_mcp_server_status", {
    workspaceId,
    cursor,
    limit,
  });
}
```

Keep every other desktop-only action unchanged. This task does not widen any file-system or OS-integrated command.

- [ ] **Step 3: Run the targeted service tests**

Run:

```bash
npm run test -- src/services/tauri.test.ts
```

Expected:

- the existing desktop `invoke()` assertions still pass
- the new web `fetch()` assertions pass
- no unrelated wrapper regressions appear

- [ ] **Step 4: Commit the service-layer transport change**

Run:

```bash
git add src/services/tauri.ts src/services/tauri.test.ts
git commit -m "feat: route web review and mcp rpc calls"
```

### Task 3: Gate Shared UI Entry Points With The Runtime Capability Model

**Files:**

- Modify: `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx`
- Modify: `src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx`
- Modify: `src/features/app/hooks/useMainAppLayoutSurfaces.ts`
- Modify: `src/features/git/components/GitDiffPanel.test.tsx`

- [ ] **Step 1: Add failing tests for runtime capability propagation**

Update the focused UI tests so they describe the new review/MCP-ready web state and the hidden-button fallback:

```ts
it("surfaces fetched review and mcp capability flags in web runtime", async () => {
  setMockRuntimeConfig({
    runtime: "web",
    bridgeBaseUrl: "https://bridge.example.com",
  });
  fetchBridgeCapabilitiesMock.mockResolvedValue({
    version: 1,
    methods: ["start_review", "list_mcp_server_status"],
    threadControls: {
      steer: true,
      fork: true,
      compact: true,
      review: true,
      mcp: true,
    },
    files: {
      workspaceTree: false,
      workspaceAgents: false,
      globalAgents: false,
      globalConfig: false,
    },
    operations: {
      usageSnapshot: false,
      doctorReport: false,
      featureFlags: false,
    },
  });

  const { result } = renderHook(() => useWebRuntimeCapabilities());

  await waitFor(() =>
    expect(result.current.threadControls).toEqual({
      steer: true,
      fork: true,
      compact: true,
      review: true,
      mcp: true,
    }),
  );
});

it("mirrors review and mcp command capabilities from runtime support", () => {
  const { result } = renderHook(() =>
    useMainAppComposerWorkspaceState(buildArgs()),
  );

  expect(result.current.commandCapabilities).toEqual({
    fork: true,
    compact: true,
    review: true,
    mcp: true,
  });
});

it("hides the uncommitted review button when no review callback is supplied", () => {
  render(
    <GitDiffPanel
      {...baseProps}
      workspaceId="ws-2"
      unstagedFiles={[{ path: "src/file.ts", status: "M", additions: 4, deletions: 1 }]}
    />,
  );

  expect(
    screen.queryByRole("button", { name: "Review uncommitted changes" }),
  ).toBeNull();
});
```

Run:

```bash
npm run test -- \
  src/features/app/hooks/useWebRuntimeCapabilities.test.tsx \
  src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx \
  src/features/git/components/GitDiffPanel.test.tsx
```

Expected: the button-hiding assertion fails because `useMainAppLayoutSurfaces.ts` still always supplies the callback.

- [ ] **Step 2: Gate the Git diff review entry point with `commandCapabilities.review`**

Update `src/features/app/hooks/useMainAppLayoutSurfaces.ts` where the Git surface props are assembled:

```ts
onReviewUncommittedChanges: composerWorkspaceState.commandCapabilities.review
  ? (workspaceId) =>
      startUncommittedReview(workspaceId ?? activeWorkspace?.id ?? null)
  : undefined,
```

Do not add a second source of truth. The same `composerWorkspaceState.commandCapabilities.review` value should continue to drive composer slash-command visibility and this Git diff entry point.

- [ ] **Step 3: Re-run the focused UI tests**

Run:

```bash
npm run test -- \
  src/features/app/hooks/useWebRuntimeCapabilities.test.tsx \
  src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx \
  src/features/git/components/GitDiffPanel.test.tsx
```

Expected:

- the web capability hook test passes with `review: true` and `mcp: true`
- the composer workspace state test still reports the same command flags
- the Git diff panel only shows the review button when a callback is present

- [ ] **Step 4: Commit the UI gating change**

Run:

```bash
git add \
  src/features/app/hooks/useWebRuntimeCapabilities.test.tsx \
  src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx \
  src/features/app/hooks/useMainAppLayoutSurfaces.ts \
  src/features/git/components/GitDiffPanel.test.tsx
git commit -m "feat: gate web review entry points by runtime capability"
```

### Task 4: Harden Review And MCP Thread Flows With Regression Tests

**Files:**

- Modify: `src/features/threads/hooks/useThreadMessaging.test.tsx`
- Modify: `src/features/threads/hooks/useThreads.integration.test.tsx`

- [ ] **Step 1: Add failing MCP summary and error tests**

Extend `src/features/threads/hooks/useThreadMessaging.test.tsx` with one success case and one failure case for the existing `/mcp` path:

```ts
it("renders MCP status lines into the active thread", async () => {
  const dispatch = vi.fn();
  vi.mocked(listMcpServerStatusService).mockResolvedValue({
    result: {
      data: [
        {
          name: "github",
          authStatus: "authorized",
          tools: {
            mcp__github__issues: {},
            mcp__github__search: {},
          },
          resources: [{}],
          resourceTemplates: [{}, {}],
        },
      ],
    },
  } as Awaited<ReturnType<typeof listMcpServerStatusService>>);

  const { result } = renderHook(() =>
    useThreadMessaging({
      activeWorkspace: workspace,
      activeThreadId: "thread-1",
      accessMode: "current",
      model: null,
      effort: null,
      collaborationMode: null,
      reviewDeliveryMode: "inline",
      steerEnabled: false,
      customPrompts: [],
      threadStatusById: {},
      activeTurnIdByThread: {},
      rateLimitsByWorkspace: {},
      pendingInterruptsRef: { current: new Set<string>() },
      dispatch,
      getCustomName: vi.fn(() => undefined),
      markProcessing: vi.fn(),
      markReviewing: vi.fn(),
      setActiveTurnId: vi.fn(),
      recordThreadActivity: vi.fn(),
      safeMessageActivity: vi.fn(),
      onDebug: vi.fn(),
      pushThreadErrorMessage: vi.fn(),
      ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
      ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
      refreshThread: vi.fn(async () => null),
      forkThreadForWorkspace: vi.fn(async () => null),
      updateThreadParent: vi.fn(),
    }),
  );

  await act(async () => {
    await result.current.startMcp("/mcp");
  });

  expect(dispatch).toHaveBeenCalledWith({
    type: "addAssistantMessage",
    threadId: "thread-1",
    text: [
      "MCP tools:",
      "- github (auth: authorized)",
      "  tools: issues, search",
      "  resources: 1, templates: 2",
    ].join("\\n"),
  });
});

it("renders an MCP fallback message when the status request fails", async () => {
  const dispatch = vi.fn();
  vi.mocked(listMcpServerStatusService).mockRejectedValueOnce(
    new Error("bridge denied method"),
  );

  const { result } = renderHook(() =>
    useThreadMessaging({
      activeWorkspace: workspace,
      activeThreadId: "thread-1",
      accessMode: "current",
      model: null,
      effort: null,
      collaborationMode: null,
      reviewDeliveryMode: "inline",
      steerEnabled: false,
      customPrompts: [],
      threadStatusById: {},
      activeTurnIdByThread: {},
      rateLimitsByWorkspace: {},
      pendingInterruptsRef: { current: new Set<string>() },
      dispatch,
      getCustomName: vi.fn(() => undefined),
      markProcessing: vi.fn(),
      markReviewing: vi.fn(),
      setActiveTurnId: vi.fn(),
      recordThreadActivity: vi.fn(),
      safeMessageActivity: vi.fn(),
      onDebug: vi.fn(),
      pushThreadErrorMessage: vi.fn(),
      ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
      ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
      refreshThread: vi.fn(async () => null),
      forkThreadForWorkspace: vi.fn(async () => null),
      updateThreadParent: vi.fn(),
    }),
  );

  await act(async () => {
    await result.current.startMcp("/mcp");
  });

  expect(dispatch).toHaveBeenCalledWith({
    type: "addAssistantMessage",
    threadId: "thread-1",
    text: "MCP tools:\\n- bridge denied method",
  });
});
```

Run: `npm run test -- src/features/threads/hooks/useThreadMessaging.test.tsx`

Expected: the new tests fail because the file does not yet contain assertions for the `/mcp` success and failure paths.

- [ ] **Step 2: Add an integration test for the uncommitted-review entry path**

Extend `src/features/threads/hooks/useThreads.integration.test.tsx` so the non-composer review launcher still gets the same detached-child behavior:

```ts
it("links detached review threads started from the uncommitted-review action", async () => {
  vi.mocked(startReview).mockResolvedValue({
    result: { reviewThreadId: "thread-review-1" },
  });

  const { result } = renderHook(() =>
    useThreads({
      activeWorkspace: workspace,
      onWorkspaceConnected: vi.fn(),
      reviewDeliveryMode: "detached",
    }),
  );

  act(() => {
    result.current.setActiveThreadId("thread-parent");
  });

  await act(async () => {
    await result.current.startUncommittedReview("ws-1");
  });

  await waitFor(() => {
    expect(vi.mocked(startReview)).toHaveBeenCalledWith(
      "ws-1",
      "thread-parent",
      { type: "uncommittedChanges" },
      "detached",
    );
  });

  expect(result.current.threadParentById["thread-review-1"]).toBe("thread-parent");
});
```

This test should live near the existing detached-review integration coverage so all review lifecycle assertions stay together.

- [ ] **Step 3: Run the thread-level regression tests**

Run:

```bash
npm run test -- \
  src/features/threads/hooks/useThreadMessaging.test.tsx \
  src/features/threads/hooks/useThreads.integration.test.tsx
```

Expected:

- `/mcp` now renders the formatted assistant message
- `/mcp` failures still render a readable fallback message
- `startUncommittedReview()` keeps detached child-thread linking intact

- [ ] **Step 4: Commit the thread-level regression coverage**

Run:

```bash
git add src/features/threads/hooks/useThreadMessaging.test.tsx src/features/threads/hooks/useThreads.integration.test.tsx
git commit -m "test: cover web review and mcp thread flows"
```

### Task 5: Run The Full Validation Matrix

**Files:**

- Modify: none

- [ ] **Step 1: Run the frontend test suite**

Run:

```bash
npm run test
```

Expected: the full Vitest suite passes with the new bridge, UI, and thread-flow coverage included.

- [ ] **Step 2: Run the required type check**

Run:

```bash
npm run typecheck
```

Expected: passes with no TypeScript errors.

- [ ] **Step 3: Run the Rust compile check for the touched backend**

Run:

```bash
cd src-tauri && cargo check
```

Expected: passes with no new compile errors in the bridge binary or shared modules.

- [ ] **Step 4: Run the whitespace and patch hygiene check**

Run:

```bash
git diff --check
```

Expected: no whitespace errors, conflict markers, or malformed hunks.

## Self-Review

Spec coverage check:

- `start_review` generic review flows are covered by Task 1 and Task 2.
- detached review lifecycle support is reinforced in Task 4.
- `list_mcp_server_status` summary visibility is covered by Task 1, Task 2, and Task 4.
- the non-composer shared UI entry point for uncommitted review is covered by Task 3.
- PR-specific GitHub review actions remain intentionally out of scope.

Placeholder scan:

- No `TODO`, `TBD`, or "implement later" markers remain.
- Every task names exact files and exact verification commands.

Type consistency:

- Capability names stay aligned with the current shared payload: `threadControls.review` and `threadControls.mcp`.
- RPC method names stay aligned with the backend contract: `start_review` and `list_mcp_server_status`.
