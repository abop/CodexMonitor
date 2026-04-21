# Web Parity Read-Only Workspace Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `Phase 2A` for the web runtime by exposing the existing read-only workspace file RPCs through the bridge, gating shared UI on runtime file capability, and preserving a safe browser experience for file preview and composer insertion.

**Architecture:** Reuse the existing shared backend file RPCs instead of adding new transport shapes. Extend the shared bridge capability catalog to advertise read-only file-tree support, route the frontend file service wrappers through `invokeSupportedRpc()` in web runtime, and make the shared Git/file panel capability-aware so unsupported runtimes hide the `Files` tab instead of exposing dead controls. Keep preview behavior text-first and degrade desktop-only affordances such as reveal-in-file-manager and native context menus when running in the browser.

**Tech Stack:** Rust, Axum, shared Tauri modules, React, TypeScript, Vitest, existing daemon JSON-RPC bridge.

---

## Scope Split

This plan covers only `Phase 2A` from `docs/superpowers/specs/2026-04-21-web-parity-roadmap-design.md`:

- workspace file tree in web runtime
- read-only text preview for workspace files
- snippet insertion from file preview into the composer
- capability-aware hiding of the `Files` tab when the runtime does not support it

This plan does not cover:

- write access to workspace files
- `AGENTS.md` and global config visibility from `Phase 2B`
- environment/config-origin surfaces from `Phase 2C`
- desktop-native reveal/open-in-editor parity
- binary/media preview parity

## File Structure

Modify:

- `src-tauri/src/shared/web_runtime_capabilities.rs` - advertise bridge support for read-only workspace files.
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` - route tests that verify file capability advertising and RPC forwarding.
- `src/services/tauri.ts` - route `getWorkspaceFiles()` and `readWorkspaceFile()` through `invokeSupportedRpc()` so web uses the bridge.
- `src/services/tauri.test.ts` - service coverage for web file RPC routing.
- `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx` - confirm web capability fetch now reports `workspaceTree`.
- `src/features/app/hooks/useWorkspaceFileListing.ts` - stop file fetching when runtime file capability is unavailable.
- `src/features/app/hooks/useMainAppComposerWorkspaceState.ts` - thread file capability into file listing logic.
- `src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx` - verify file listing is disabled when runtime file capability is false.
- `src/features/app/hooks/useMainAppLayoutSurfaces.ts` - pass runtime file capability down to the Git/file panel surface.
- `src/features/app/hooks/useMainAppLayoutSurfaces.test.tsx` - verify the `Files` tab disappears when file-tree support is unavailable.
- `src/features/layout/components/PanelShell.tsx` - allow callers to provide a filtered tab list.
- `src/features/layout/components/PanelTabs.test.tsx` - keep tab rendering covered when a filtered tab list is supplied.
- `src/features/git/components/GitDiffPanel.tsx` - pass capability-aware tabs into the shared panel shell.
- `src/features/git/components/GitDiffPanel.test.tsx` - verify filtered tabs render as expected.
- `src/features/files/components/FileTreePanel.tsx` - avoid desktop-only context-menu behavior in web runtime while keeping preview and add-to-chat intact.

No new runtime modules are required for this slice.

### Task 1: Expose Read-Only File RPCs Through The Bridge

**Files:**

- Modify: `src-tauri/src/shared/web_runtime_capabilities.rs`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- Modify: `src/services/tauri.ts`
- Modify: `src/services/tauri.test.ts`

- [ ] **Step 1: Add failing bridge tests for file capability and forwarding**

Extend `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs` with route tests that prove the bridge currently blocks the Phase 2A file slice:

```rust
#[test]
fn advertises_workspace_tree_file_support() {
    let capabilities = bridge_capabilities_v1();
    let methods = capabilities.methods;

    assert!(capabilities.files.workspace_tree);
    assert!(methods.contains(&"list_workspace_files"));
    assert!(methods.contains(&"read_workspace_file"));
}

#[test]
fn forwards_workspace_file_requests() {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime")
        .block_on(async {
            let requests = [
                (
                    "list_workspace_files",
                    json!({ "workspaceId": "ws-1" }),
                ),
                (
                    "read_workspace_file",
                    json!({ "workspaceId": "ws-1", "path": "src/main.ts" }),
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

Run:

```bash
cd src-tauri
cargo test --bin codex_monitor_web_bridge \
  routes::tests::advertises_workspace_tree_file_support \
  routes::tests::forwards_workspace_file_requests
```

Expected: both tests fail because the bridge still reports `workspace_tree: false` and the two file methods are not on the allowlist.

- [ ] **Step 2: Advertise Phase 2A file support in the shared capability catalog**

Update `src-tauri/src/shared/web_runtime_capabilities.rs` so the shared allowlist and serialized payload both expose the read-only file slice. Insert these exact method entries into `BRIDGE_ALLOWED_RPC_METHODS` next to the other workspace RPCs:

```rust
    "add_workspace_from_git_url",
    "connect_workspace",
    "remove_workspace",
    "remove_worktree",
    "rename_worktree",
    "rename_worktree_upstream",
    "apply_worktree_changes",
    "list_workspace_files",
    "read_workspace_file",
    "set_workspace_runtime_codex_args",
```

Then turn on only the Phase 2A capability flag in `bridge_capabilities_v1()`:

```rust
        files: FileCapabilities {
            workspace_tree: true,
            workspace_agents: false,
            global_agents: false,
            global_config: false,
        },
```

Do not enable any write-oriented or config-oriented file flags in this batch.

- [ ] **Step 3: Add failing web service tests for the file wrappers**

Extend `src/services/tauri.test.ts` with web-runtime assertions for the two file helpers:

```ts
it("routes getWorkspaceFiles through bridgeRpc in web runtime", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://bridge.example.com");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: ["src/main.ts", "README.md"] }),
    }),
  );

  await expect(getWorkspaceFiles("ws-1")).resolves.toEqual([
    "src/main.ts",
    "README.md",
  ]);

  expect(fetch).toHaveBeenCalledWith(
    "https://bridge.example.com/api/rpc",
    expect.objectContaining({
      body: JSON.stringify({
        method: "list_workspace_files",
        params: { workspaceId: "ws-1" },
      }),
    }),
  );
});

it("routes readWorkspaceFile through bridgeRpc in web runtime", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://bridge.example.com");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { content: "export {};", truncated: false },
      }),
    }),
  );

  await expect(readWorkspaceFile("ws-1", "src/main.ts")).resolves.toEqual({
    content: "export {};",
    truncated: false,
  });

  expect(fetch).toHaveBeenCalledWith(
    "https://bridge.example.com/api/rpc",
    expect.objectContaining({
      body: JSON.stringify({
        method: "read_workspace_file",
        params: { workspaceId: "ws-1", path: "src/main.ts" },
      }),
    }),
  );
});
```

Run:

```bash
npm run test -- src/services/tauri.test.ts
```

Expected: both new tests fail because the wrappers still require desktop runtime.

- [ ] **Step 4: Route the file service wrappers through `invokeSupportedRpc()`**

Update `src/services/tauri.ts` so the two helpers stop hard-failing in web runtime:

```ts
export async function getWorkspaceFiles(workspaceId: string) {
  return invokeSupportedRpc<string[]>("list_workspace_files", {
    workspaceId,
  });
}

export async function readWorkspaceFile(workspaceId: string, path: string) {
  return invokeSupportedRpc<{ content: string; truncated: boolean }>(
    "read_workspace_file",
    {
      workspaceId,
      path,
    },
  );
}
```

Do not add new web-only transport code here; keep the existing desktop and web routing centralized in `invokeSupportedRpc()`.

- [ ] **Step 5: Run the targeted bridge and service tests**

Run:

```bash
cd src-tauri
cargo test --bin codex_monitor_web_bridge \
  routes::tests::advertises_workspace_tree_file_support \
  routes::tests::forwards_workspace_file_requests
cd ..
npm run test -- src/services/tauri.test.ts
```

Expected:

- the two bridge tests pass
- the two new service tests pass in web runtime
- existing nearby service tests stay green

- [ ] **Step 6: Commit the transport slice**

Run:

```bash
git add src-tauri/src/shared/web_runtime_capabilities.rs \
  src-tauri/src/bin/codex_monitor_web_bridge/routes.rs \
  src/services/tauri.ts \
  src/services/tauri.test.ts
git commit -m "feat: bridge read-only workspace files to web"
```

### Task 2: Make Shared UI Capability-Aware For The Files Tab

**Files:**

- Modify: `src/features/app/hooks/useWebRuntimeCapabilities.test.tsx`
- Modify: `src/features/app/hooks/useWorkspaceFileListing.ts`
- Modify: `src/features/app/hooks/useMainAppComposerWorkspaceState.ts`
- Modify: `src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx`
- Modify: `src/features/app/hooks/useMainAppLayoutSurfaces.ts`
- Modify: `src/features/app/hooks/useMainAppLayoutSurfaces.test.tsx`
- Modify: `src/features/layout/components/PanelShell.tsx`
- Modify: `src/features/layout/components/PanelTabs.test.tsx`
- Modify: `src/features/git/components/GitDiffPanel.tsx`
- Modify: `src/features/git/components/GitDiffPanel.test.tsx`

- [ ] **Step 1: Add failing capability tests that capture the desired UX**

Extend the existing hook and panel tests with three expectations:

1. `useWebRuntimeCapabilities()` should expose `files.workspaceTree: true` after a successful web fetch.
2. `useMainAppComposerWorkspaceState()` should disable file listing when `runtimeCapabilities.files.workspaceTree` is false.
3. `useMainAppLayoutSurfaces()` / `GitDiffPanel` should render only `Git` and `Prompts` tabs when file-tree support is unavailable.

Use assertions along these lines:

```ts
expect(result.current.files.workspaceTree).toBe(true);
expect(useWorkspaceFileListing).toHaveBeenCalledWith(
  expect.objectContaining({ enabled: false }),
);
expect(screen.queryByRole("tab", { name: "Files" })).toBeNull();
```

Run:

```bash
npm run test -- \
  src/features/app/hooks/useWebRuntimeCapabilities.test.tsx \
  src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx \
  src/features/app/hooks/useMainAppLayoutSurfaces.test.tsx \
  src/features/git/components/GitDiffPanel.test.tsx \
  src/features/layout/components/PanelTabs.test.tsx
```

Expected: the new assertions fail because file support is not yet threaded through these surfaces.

- [ ] **Step 2: Thread runtime file capability into file listing and panel tabs**

Update `useMainAppComposerWorkspaceState()` so the runtime capability type includes `files` and the `useWorkspaceFileListing()` call is disabled when `files.workspaceTree` is false:

```ts
  runtimeCapabilities: Pick<WebRuntimeCapabilities, "threadControls" | "files">;
```

```ts
  const { threadControls, files: fileCapabilities } = runtimeCapabilities;
```

```ts
    enabled: Boolean(fileCapabilities.workspaceTree),
```

In `useWorkspaceFileListing.ts`, tighten `shouldFetchFiles` so a disabled capability suppresses both the panel fetch and `@file` autocomplete fetches.

Then update the Git panel surface to pass filtered tabs down instead of relying on `PanelTabs` defaults:

```ts
const panelTabs = fileTreeAvailable
  ? undefined
  : [
      { id: "git", label: "Git", icon: <GitBranch aria-hidden /> },
      { id: "prompts", label: "Prompts", icon: <ScrollText aria-hidden /> },
    ];
```

Add a `tabs?: PanelTab[]` prop to `PanelShell`, thread it into `PanelTabs`, and pass the filtered list from `GitDiffPanel`.

Keep the desktop path using the existing default tabs.

- [ ] **Step 3: Run the targeted UI tests**

Run:

```bash
npm run test -- \
  src/features/app/hooks/useWebRuntimeCapabilities.test.tsx \
  src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx \
  src/features/app/hooks/useMainAppLayoutSurfaces.test.tsx \
  src/features/git/components/GitDiffPanel.test.tsx \
  src/features/layout/components/PanelTabs.test.tsx
```

Expected:

- capability fetch tests show `workspaceTree: true`
- file listing is disabled when the capability is false
- the `Files` tab disappears cleanly when unsupported

- [ ] **Step 4: Commit the capability-aware shared UI slice**

Run:

```bash
git add src/features/app/hooks/useWebRuntimeCapabilities.test.tsx \
  src/features/app/hooks/useWorkspaceFileListing.ts \
  src/features/app/hooks/useMainAppComposerWorkspaceState.ts \
  src/features/app/hooks/useMainAppComposerWorkspaceState.test.tsx \
  src/features/app/hooks/useMainAppLayoutSurfaces.ts \
  src/features/app/hooks/useMainAppLayoutSurfaces.test.tsx \
  src/features/layout/components/PanelShell.tsx \
  src/features/layout/components/PanelTabs.test.tsx \
  src/features/git/components/GitDiffPanel.tsx \
  src/features/git/components/GitDiffPanel.test.tsx
git commit -m "feat: gate workspace files on runtime capability"
```

### Task 3: Keep File Preview Safe In Web Runtime

**Files:**

- Modify: `src/features/files/components/FileTreePanel.tsx`

- [ ] **Step 1: Add a failing component test for the web-safe context-menu fallback**

Create or extend a component test around `FileTreePanel` that right-clicks a file row in web runtime and asserts no Tauri menu API is invoked. The essential assertion is:

```ts
expect(menuNewMock).not.toHaveBeenCalled();
```

If a focused `FileTreePanel` test file does not exist yet, add one next to the component and keep the setup minimal: one workspace, one file row, and `VITE_CODEXMONITOR_RUNTIME=web`.

Run:

```bash
npm run test -- src/features/files/components/FileTreePanel.test.tsx
```

Expected: the test fails because the current right-click path still tries to build a native Tauri menu.

- [ ] **Step 2: Degrade desktop-only actions when running in the browser**

In `src/features/files/components/FileTreePanel.tsx`, read the runtime once and short-circuit the context menu handler in web runtime:

```ts
const isWeb = isWebRuntime();
```

```ts
  const showMenu = useCallback(
    async (event: MouseEvent<HTMLButtonElement>, relativePath: string) => {
      if (isWeb) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // existing Tauri menu code
    },
    [canInsertText, isWeb, onInsertText, resolvePath],
  );
```

Do not change the preview open path. Text preview and `Add to chat` should continue to work through the existing left-click preview flow, and image preview can continue to show the existing “Image preview unavailable” state in web runtime when no local file source is available.

- [ ] **Step 3: Run the focused file-preview tests**

Run:

```bash
npm run test -- \
  src/features/files/components/FileTreePanel.test.tsx \
  src/features/files/components/FilePreviewPopover.test.tsx
```

Expected:

- the new FileTreePanel web-runtime guard test passes
- existing preview-popover tests remain green

- [ ] **Step 4: Commit the web-safe file panel behavior**

Run:

```bash
git add src/features/files/components/FileTreePanel.tsx \
  src/features/files/components/FileTreePanel.test.tsx \
  src/features/files/components/FilePreviewPopover.test.tsx
git commit -m "fix: keep file panel web-safe"
```

### Task 4: Run Full Verification

**Files:**

- No additional source files.

- [ ] **Step 1: Run the full frontend verification suite**

Run:

```bash
npm run test
npm run typecheck
```

Expected:

- all Vitest suites pass
- typecheck passes without new errors

- [ ] **Step 2: Run the backend verification for the touched Rust bridge code**

Run:

```bash
cd src-tauri
cargo check
```

Expected: `cargo check` passes for the app and bridge workspace.

- [ ] **Step 3: Run whitespace and patch hygiene checks**

Run:

```bash
git diff --check
git status --short --branch
```

Expected:

- `git diff --check` prints nothing
- `git status --short --branch` shows only the planned branch commits

- [ ] **Step 4: Commit the verification-only follow-up if needed**

If any small test-fix or typing adjustment was required after the previous commits, make a final cleanup commit:

```bash
git add -A
git commit -m "test: stabilize web workspace file parity"
```

If no extra fixes were needed, skip this commit.

## Self-Review

- Spec coverage: this plan covers the full `Phase 2A` slice from the roadmap and deliberately leaves `Phase 2B`, `Phase 2C`, and any write access out of scope.
- Placeholder scan: no `TODO`, `TBD`, or “similar to above” placeholders remain.
- Type consistency: use `files.workspaceTree` end-to-end, matching the existing runtime capability schema already used by `useWebRuntimeCapabilities()`.
