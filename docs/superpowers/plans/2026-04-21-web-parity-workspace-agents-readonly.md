# Web Parity Workspace AGENTS Read-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the next `Phase 2B` web-safe file/environment slice by exposing read-only workspace `AGENTS.md` visibility in web runtime without opening generic file-read or any write path.

**Architecture:** Add a narrow cross-runtime RPC for `read_workspace_agent_md` instead of allowlisting the generic `file_read` method through the bridge. Reuse the existing shared file-policy core to enforce workspace-root-only reads, advertise `files.workspaceAgents` from the bridge capability catalog, and thread that capability into the existing Workspace Home AGENTS editor so web runtime can refresh and inspect the file while remaining explicitly read-only.

**Tech Stack:** Rust, Tauri commands, daemon JSON-RPC, Axum bridge, React, TypeScript, Vitest.

---

## Scope Split

This plan covers only the first narrow sub-slice of `Phase 2B` from `docs/superpowers/specs/2026-04-21-web-parity-roadmap-design.md`:

- read-only workspace `AGENTS.md` visibility in web runtime
- bridge capability advertising for workspace AGENTS support
- capability-aware Workspace Home UI that enables refresh but keeps editing read-only in web runtime

This plan does not cover:

- global `AGENTS.md`
- global `config.toml`
- agent config surfaces
- any write path for `AGENTS.md`
- web settings navigation changes

## File Structure

Modify:

- `src-tauri/src/files/mod.rs` - add a narrow read-only workspace AGENTS command wrapper.
- `src-tauri/src/bin/codex_monitor_daemon.rs` - add daemon support for the new workspace AGENTS read method.
- `src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs` - route the new RPC method.
- `src-tauri/src/shared/web_runtime_capabilities.rs` - advertise `workspaceAgents` support and allow the narrow RPC through the bridge.
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` - bridge tests for capability advertising and RPC forwarding.
- `src-tauri/src/lib.rs` - register the new Tauri command.
- `src-tauri/src/remote_backend/mod.rs` - allow reconnect retry for the new read-only RPC.
- `src/services/tauri.ts` - route `readAgentMd()` through the new supported RPC method.
- `src/services/tauri.test.ts` - verify desktop invocation and web bridge routing.
- `src/features/workspaces/hooks/useWorkspaceAgentMd.ts` - allow read-only loading in web runtime when capability is available.
- `src/features/workspaces/hooks/useWorkspaceAgentMd.test.tsx` - cover both disabled and enabled web-runtime behavior.
- `src/features/app/hooks/useMainAppComposerWorkspaceState.ts` - pass workspace AGENTS capability into the hook and return availability to the UI.
- `src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx` - verify the hook receives the runtime capability.
- `src/features/workspaces/components/WorkspaceHome.tsx` - stop showing the generic unavailable message when the feature is supported, keep refresh enabled, and render the textarea as read-only in web runtime.
- `src/features/workspaces/components/WorkspaceHome.test.tsx` - verify the AGENTS editor props in supported web runtime.
- `src/features/shared/components/FileEditorCard.tsx` - support `readOnly` mode without disabling refresh or text selection.
- `docs/web-desktop-parity.md` - update the live parity doc for workspace AGENTS visibility.

No global settings section changes belong in this slice.

### Task 1: Add A Narrow `read_workspace_agent_md` Backend Path

**Files:**

- Modify: `src-tauri/src/files/mod.rs`
- Modify: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Modify: `src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/remote_backend/mod.rs`
- Modify: `src-tauri/src/shared/web_runtime_capabilities.rs`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`

- [ ] **Step 1: Add failing bridge tests for workspace AGENTS capability and forwarding**

Extend `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` with tests that describe the new narrow RPC:

```rust
#[test]
fn advertises_workspace_agent_file_support() {
    let capabilities = bridge_capabilities_v1();
    let methods = capabilities.methods;

    assert!(capabilities.files.workspace_agents);
    assert!(methods.contains(&"read_workspace_agent_md"));
}

#[test]
fn forwards_workspace_agent_read_requests() {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime")
        .block_on(async {
            let (client, mut server) = test_client_pair().await;
            let params = json!({ "workspaceId": "ws-1" });
            server
                .enqueue_result(
                    1,
                    json!({ "exists": true, "content": "# Agent", "truncated": false }),
                )
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
                            json!({
                                "method": "read_workspace_agent_md",
                                "params": params
                            })
                            .to_string(),
                        ))
                        .unwrap(),
                )
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(server.last_method().await, "read_workspace_agent_md");
            assert_eq!(server.last_params().await, params);
        });
}
```

Run:

```bash
cd src-tauri
cargo test --bin codex_monitor_web_bridge advertises_workspace_agent_file_support
cargo test --bin codex_monitor_web_bridge forwards_workspace_agent_read_requests
```

Expected: both tests fail because the capability flag is still false and the bridge does not yet allow the method.

- [ ] **Step 2: Add the new app and daemon read method with shared file policy reuse**

In `src-tauri/src/files/mod.rs`, add a narrow command that calls the existing `file_read_impl()` with fixed workspace AGENTS arguments:

```rust
#[tauri::command]
pub(crate) async fn read_workspace_agent_md(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<TextFileResponse, String> {
    file_read_impl(
        FileScope::Workspace,
        FileKind::Agents,
        Some(workspace_id),
        &*state,
        &app,
    )
    .await
}
```

Mirror that shape in the daemon:

- add `async fn read_workspace_agent_md(&self, workspace_id: String) -> Result<file_io::TextFileResponse, String>` in `src-tauri/src/bin/codex_monitor_daemon.rs`
- route `"read_workspace_agent_md"` in `src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs` using `workspace_rpc::WorkspaceIdRequest`
- register the command in `src-tauri/src/lib.rs`
- add `"read_workspace_agent_md"` to the retry-safe list in `src-tauri/src/remote_backend/mod.rs`

Do not add a generic web `file_read` bridge path in this batch.

- [ ] **Step 3: Advertise the new capability through the bridge catalog**

Update `src-tauri/src/shared/web_runtime_capabilities.rs`:

```rust
    "read_workspace_file",
    "read_workspace_agent_md",
    "set_workspace_runtime_codex_args",
```

And enable only the workspace AGENTS file capability:

```rust
        files: FileCapabilities {
            workspace_tree: true,
            workspace_agents: true,
            global_agents: false,
            global_config: false,
        },
```

Keep `global_agents` and `global_config` false.

- [ ] **Step 4: Run the targeted Rust tests**

Run:

```bash
cd src-tauri
cargo test --bin codex_monitor_web_bridge
cargo check
```

Expected: the bridge suite and compile pass with the new method wired across app, daemon, and bridge.

### Task 2: Route The Frontend Through The Narrow RPC

**Files:**

- Modify: `src/services/tauri.ts`
- Modify: `src/services/tauri.test.ts`

- [ ] **Step 1: Add failing service coverage for web AGENTS reads**

Extend `src/services/tauri.test.ts` with a web-runtime assertion:

```ts
it("routes readAgentMd through bridgeRpc in web runtime", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://bridge.example.com");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { exists: true, content: "# Agent", truncated: false },
      }),
    }),
  );

  await expect(readAgentMd("ws-agent")).resolves.toEqual({
    exists: true,
    content: "# Agent",
    truncated: false,
  });

  expect(fetch).toHaveBeenCalledWith(
    "https://bridge.example.com/api/rpc",
    expect.objectContaining({
      body: JSON.stringify({
        method: "read_workspace_agent_md",
        params: { workspaceId: "ws-agent" },
      }),
    }),
  );
});
```

Run:

```bash
npm run test -- src/services/tauri.test.ts
```

Expected: the new test fails because `readAgentMd()` still uses the desktop-only `file_read` wrapper.

- [ ] **Step 2: Route `readAgentMd()` through `invokeSupportedRpc()`**

Update `src/services/tauri.ts`:

```ts
export async function readAgentMd(workspaceId: string): Promise<AgentMdResponse> {
  return invokeSupportedRpc<AgentMdResponse>("read_workspace_agent_md", {
    workspaceId,
  });
}
```

Do not change `writeAgentMd()` in this slice.

- [ ] **Step 3: Keep desktop invocation coverage aligned**

Update the existing desktop assertion in `src/services/tauri.test.ts` so it expects:

```ts
expect(invokeMock).toHaveBeenCalledWith("read_workspace_agent_md", {
  workspaceId: "ws-agent",
});
```

- [ ] **Step 4: Run the targeted service tests**

Run:

```bash
npm run test -- src/services/tauri.test.ts
```

Expected: both the desktop and web AGENTS wrapper tests pass.

### Task 3: Make Workspace Home Capability-Aware And Read-Only In Web

**Files:**

- Modify: `src/features/workspaces/hooks/useWorkspaceAgentMd.ts`
- Modify: `src/features/workspaces/hooks/useWorkspaceAgentMd.test.tsx`
- Modify: `src/features/app/hooks/useMainAppComposerWorkspaceState.ts`
- Modify: `src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx`
- Modify: `src/features/workspaces/components/WorkspaceHome.tsx`
- Modify: `src/features/workspaces/components/WorkspaceHome.test.tsx`
- Modify: `src/features/shared/components/FileEditorCard.tsx`

- [ ] **Step 1: Add failing hook and UI tests**

Replace the current web-runtime AGENTS hook test with two cases:

```ts
it("stays inert in web runtime when workspace AGENTS capability is unavailable", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

  renderHook(() =>
    useWorkspaceAgentMd({ activeWorkspace: workspace, enabled: false }),
  );

  await act(async () => {
    await Promise.resolve();
  });

  expect(vi.mocked(readAgentMd)).not.toHaveBeenCalled();
});

it("loads AGENTS.md in web runtime when workspace AGENTS capability is available", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  vi.mocked(readAgentMd).mockResolvedValue({
    exists: true,
    content: "# Agent",
    truncated: false,
  });

  const { result } = renderHook(() =>
    useWorkspaceAgentMd({ activeWorkspace: workspace, enabled: true }),
  );

  await act(async () => {
    await Promise.resolve();
  });

  expect(vi.mocked(readAgentMd)).toHaveBeenCalledWith("workspace-1");
  expect(result.current.content).toBe("# Agent");
});
```

Add a new `useMainAppComposerWorkspaceState` assertion that the runtime capability is threaded through:

```ts
expect(useWorkspaceAgentMdMock).toHaveBeenCalledWith(
  expect.objectContaining({
    enabled: false,
  }),
);
```

Add a `WorkspaceHome` test that inspects the mocked `FileEditorCard` props and proves supported web runtime is read-only rather than unavailable:

```ts
expect(fileEditorCardProps.error).toBeNull();
expect(fileEditorCardProps.refreshDisabled).toBe(false);
expect(fileEditorCardProps.saveDisabled).toBe(true);
expect(fileEditorCardProps.readOnly).toBe(true);
```

Run:

```bash
npm run test -- \
  src/features/workspaces/hooks/useWorkspaceAgentMd.test.tsx \
  src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx \
  src/features/workspaces/components/WorkspaceHome.test.tsx
```

Expected: these new assertions fail before implementation.

- [ ] **Step 2: Thread capability into the AGENTS hook**

Update `src/features/workspaces/hooks/useWorkspaceAgentMd.ts`:

```ts
type UseWorkspaceAgentMdOptions = {
  activeWorkspace: WorkspaceInfo | null;
  enabled?: boolean;
  onDebug?: (entry: DebugEntry) => void;
};
```

Use the new flag to control loading:

```ts
export function useWorkspaceAgentMd({
  activeWorkspace,
  enabled = true,
  onDebug,
}: UseWorkspaceAgentMdOptions) {
  // ...
  const readEnabled = Boolean(workspaceId) && enabled;
```

Remove the current hard `webRuntime` block from `readWithDebug()`, keep the write no-op for web runtime, and set:

```ts
  return useFileEditor({
    key: readEnabled ? workspaceId : null,
```

- [ ] **Step 3: Thread runtime capability into the main composer/workspace seam**

Update `src/features/app/hooks/useMainAppComposerWorkspaceState.ts` so `useWorkspaceAgentMd()` receives `enabled: fileCapabilities.workspaceAgents`, and return a new `agentMdAvailable` field alongside `agentMdState`.

Update the test file to hoist a real `useWorkspaceAgentMdMock` and assert the passed `enabled` flag.

- [ ] **Step 4: Render the Workspace Home AGENTS card as read-only when supported**

Extend `src/features/shared/components/FileEditorCard.tsx` with an optional `readOnly?: boolean` prop and apply it to the `<textarea>`.

Update `src/features/workspaces/components/WorkspaceHome.tsx` to:

- accept `agentMdAvailable: boolean`
- remove the generic web-build unavailable error when `agentMdAvailable` is true
- add `"Read-only"` to the meta row in supported web runtime
- keep refresh enabled when `agentMdAvailable` is true
- keep save disabled in web runtime
- pass `readOnly={webRuntime}` to `FileEditorCard`

Do not enable writes in web runtime.

- [ ] **Step 5: Run the targeted frontend tests**

Run:

```bash
npm run test -- \
  src/services/tauri.test.ts \
  src/features/workspaces/hooks/useWorkspaceAgentMd.test.tsx \
  src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx \
  src/features/workspaces/components/WorkspaceHome.test.tsx
```

Expected: all AGENTS-related targeted tests pass.

### Task 4: Update Parity Docs And Verify End-To-End

**Files:**

- Modify: `docs/web-desktop-parity.md`

- [ ] **Step 1: Update the live parity doc**

Move workspace `AGENTS.md` out of the desktop-only list and into the shared list with the correct capability qualifier:

```md
- Workspace `AGENTS.md` preview in Workspace Home when the connected bridge advertises `files.workspaceAgents`.
```

Keep global `AGENTS.md` and global config marked desktop-only for now.

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
  docs/superpowers/plans/2026-04-21-web-parity-workspace-agents-readonly.md \
  src-tauri/src/files/mod.rs \
  src-tauri/src/bin/codex_monitor_daemon.rs \
  src-tauri/src/bin/codex_monitor_daemon/rpc/workspace.rs \
  src-tauri/src/shared/web_runtime_capabilities.rs \
  src-tauri/src/bin/codex_monitor_web_bridge/routes.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/remote_backend/mod.rs \
  src/services/tauri.ts \
  src/services/tauri.test.ts \
  src/features/workspaces/hooks/useWorkspaceAgentMd.ts \
  src/features/workspaces/hooks/useWorkspaceAgentMd.test.tsx \
  src/features/app/hooks/useMainAppComposerWorkspaceState.ts \
  src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx \
  src/features/workspaces/components/WorkspaceHome.tsx \
  src/features/workspaces/components/WorkspaceHome.test.tsx \
  src/features/shared/components/FileEditorCard.tsx
git commit -m "feat: add web workspace agents visibility"
```

Expected: one clean commit containing the narrow Phase 2B workspace AGENTS slice.
