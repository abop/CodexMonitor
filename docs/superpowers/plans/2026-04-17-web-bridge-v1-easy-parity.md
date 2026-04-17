# Web Bridge V1 Easy Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining low-risk web parity gaps so the browser build can approve requests, answer agent questions, manage prompts, perform core Git write actions, and stop exposing obviously broken desktop-only entry points.

**Architecture:** Keep the existing shared React UI and extend the existing bridge/daemon RPC path rather than building a separate web UI. Add small batches of bridge allowlist methods, route the frontend service wrappers through bridge RPC in web runtime, and clean up the web UI anywhere those new capabilities still assume desktop-only dialogs, menus, or local file access.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, Rust, Tokio, Axum, existing daemon TCP RPC, browser runtime adapter, web bridge allowlist.

---

### Task 1: Web Approval And User-Input Replies

**Files:**
- Modify: `src/services/tauri.ts`
- Modify: `src/services/tauri.test.ts`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- Modify: `src/features/threads/hooks/useThreadApprovalEvents.ts`
- Test: `src/features/threads/hooks/useThreadApprovalEvents.test.tsx`
- Test: `src/features/threads/hooks/useThreadUserInput.test.tsx`

- [ ] Add failing service tests showing `respond_to_server_request` and user-input replies use bridge RPC in web runtime.
- [ ] Extend the bridge allowlist with the request-reply methods needed for approval decisions, remembered approval prefixes, and user-input answers.
- [ ] Route the web runtime service wrappers for approval decisions, remember-rule writes, and user-input replies through bridge RPC.
- [ ] Keep auto-accept-on-allowlist behavior working in web runtime by reusing the same approval reply path.
- [ ] Run targeted tests:
  - `npm run test -- src/services/tauri.test.ts src/features/threads/hooks/useThreadApprovalEvents.test.tsx src/features/threads/hooks/useThreadUserInput.test.tsx`
- [ ] Commit with a task-scoped message after review passes.

### Task 2: Web Prompt CRUD And Prompt Panel Cleanup

**Files:**
- Modify: `src/services/tauri.ts`
- Modify: `src/services/tauri.test.ts`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- Modify: `src/features/prompts/hooks/useCustomPrompts.ts`
- Modify: `src/features/prompts/components/PromptPanel.tsx`
- Test: `src/features/prompts/hooks/useCustomPrompts.test.tsx`
- Test: `src/features/prompts/components/PromptPanel.test.tsx` (create if missing)
- Modify: `src/features/app/hooks/useMainAppPromptActions.ts`

- [ ] Add failing service tests for prompt create, update, delete, and move in web runtime.
- [ ] Extend the bridge allowlist with prompt CRUD methods.
- [ ] Route prompt CRUD service wrappers through bridge RPC in web runtime.
- [ ] Replace desktop-only prompt action menus with a web-safe path in the prompt panel so edit/move/delete still work in the browser.
- [ ] Hide or disable prompt reveal-folder actions in web runtime instead of calling desktop opener APIs.
- [ ] Run targeted tests:
  - `npm run test -- src/services/tauri.test.ts src/features/prompts/hooks/useCustomPrompts.test.tsx src/features/prompts/components/PromptPanel.test.tsx`
- [ ] Commit with a task-scoped message after review passes.

### Task 3: Web Git Write Actions And Branch Operations

**Files:**
- Modify: `src/services/tauri.ts`
- Modify: `src/services/tauri.test.ts`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- Modify: `src/features/git/hooks/useGitActions.ts`
- Modify: `src/features/app/hooks/useGitCommitController.ts`
- Modify: `src/features/git/hooks/useGitBranches.ts`
- Modify: `src/features/git/components/GitDiffViewer.tsx`
- Modify: `src/features/git/components/GitDiffPanel.tsx`
- Test: `src/features/git/hooks/useGitActions.test.tsx` (create if missing)
- Test: `src/features/app/hooks/useGitCommitController.test.tsx` (create if missing)

- [ ] Add failing service tests for stage/unstage/revert/commit/fetch/pull/push/sync and branch checkout/create in web runtime.
- [ ] Extend the bridge allowlist with the Git write and branch methods needed by the current Git UI.
- [ ] Route those service wrappers through bridge RPC in web runtime.
- [ ] Replace direct desktop confirm dialogs used by Git revert flows with runtime-safe confirms so the browser build can complete the action.
- [ ] Make sure Git UI actions surface bridge errors cleanly instead of crashing when used in web runtime.
- [ ] Run targeted tests:
  - `npm run test -- src/services/tauri.test.ts src/features/git/hooks/useGitActions.test.tsx src/features/app/hooks/useGitCommitController.test.tsx`
- [ ] Commit with a task-scoped message after review passes.

### Task 4: Low-Risk Workspace Maintenance And Broken Entry Cleanup

**Files:**
- Modify: `src/services/tauri.ts`
- Modify: `src/services/tauri.test.ts`
- Modify: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- Modify: `src/features/workspaces/hooks/useWorkspaceFromUrlPrompt.ts`
- Modify: `src/features/workspaces/components/WorkspaceFromUrlPrompt.tsx`
- Modify: `src/features/app/hooks/useWorkspaceActions.ts`
- Modify: `src/features/home/components/HomeActions.tsx`
- Modify: `src/features/workspaces/hooks/useWorkspaceCrud.ts`
- Modify: `src/features/app/hooks/useWorkspaceController.ts`
- Test: `src/features/workspaces/hooks/useWorkspaceCrud.test.tsx`
- Test: `src/features/workspaces/components/WorkspaceFromUrlPrompt.test.tsx` (create if missing)

- [ ] Add failing service tests for the low-risk workspace maintenance methods we are promoting to web runtime:
  - `add_workspace_from_git_url`
  - `remove_workspace`
  - `remove_worktree`
  - `rename_worktree`
  - `rename_worktree_upstream`
  - `apply_worktree_changes`
  - `set_workspace_runtime_codex_args`
- [ ] Extend the bridge allowlist and web service wrappers for those methods.
- [ ] Make the “Add workspace from URL” flow browser-safe by allowing direct server-path text entry in web runtime instead of relying on the desktop folder picker.
- [ ] Hide or disable any remaining home/prompt/workspace entry points in web runtime that still require local desktop file access after the methods above are bridged.
- [ ] Run targeted tests:
  - `npm run test -- src/services/tauri.test.ts src/features/workspaces/hooks/useWorkspaceCrud.test.tsx src/features/workspaces/components/WorkspaceFromUrlPrompt.test.tsx`
- [ ] Commit with a task-scoped message after review passes.

### Task 5: Final Verification

**Files:**
- Verify only: existing touched files from Tasks 1-4

- [ ] Run focused frontend tests for the files touched in this plan.
- [ ] Run the full frontend suite:
  - `npm run test`
- [ ] Run type checking:
  - `npm run typecheck`
- [ ] Run bridge compile check:
  - `cd src-tauri && cargo check --bin codex_monitor_web_bridge`
- [ ] Start the local daemon, bridge, and web dev server as needed for browser verification.
- [ ] Click through the web UI for:
  - approval toast decision flow
  - request-user-input reply flow
  - prompt create/edit/delete/move
  - git stage/commit/push or fetch/pull path
  - workspace from URL modal
- [ ] Remove temporary browser artifacts and summarize what remains out of scope for this follow-up.
