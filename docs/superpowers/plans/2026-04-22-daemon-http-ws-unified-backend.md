# Daemon HTTP/WS Unified Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add daemon-native HTTP/WS endpoints and a minimal web runtime that uses the daemon directly for the shared workspace/thread flow.

**Architecture:** Extend `codex-monitor-daemon` with a browser-facing adapter over the existing daemon RPC/event core, then add frontend runtime/backend modules that route web-safe business calls through that surface while keeping desktop-only shell features separate.

**Tech Stack:** Rust, Axum, Tokio, React, Vite, Vitest, Tauri shell APIs

---

## File Structure

- Create: `docs/superpowers/specs/2026-04-22-daemon-http-ws-unified-backend-design.md`
- Create: `docs/superpowers/plans/2026-04-22-daemon-http-ws-unified-backend.md`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Create: `src-tauri/src/bin/codex_monitor_daemon/http.rs`
- Create: `src-tauri/src/bin/codex_monitor_daemon/http/auth.rs`
- Create: `src-tauri/src/bin/codex_monitor_daemon/http/routes.rs`
- Modify: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Create: `src-tauri/src/shared/web_runtime_capabilities.rs`
- Create: `src/services/runtime.ts`
- Create: `src/services/backend/http.ts`
- Create: `src/services/backend/realtime.ts`
- Modify: `src/services/tauri.ts`
- Modify: `src/services/events.ts`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Modify: `src/types.ts`
- Modify: `package.json`
- Test: `src/services/runtime.test.ts`
- Test: `src/services/backend/http.test.ts`
- Test: `src/services/events.test.ts`

## Task 1: Add daemon HTTP/WS surface

- [ ] Write failing Rust tests for capability, allowlist, auth/origin, and websocket event forwarding.
- [ ] Implement daemon HTTP config parsing and listener startup alongside the existing daemon state.
- [ ] Implement Axum routes that reuse the daemon RPC dispatcher directly.
- [ ] Re-run targeted Rust tests until green.

## Task 2: Add shared capability catalog

- [ ] Write failing tests for the browser-safe method and capability catalog.
- [ ] Implement `web_runtime_capabilities.rs` in shared backend code.
- [ ] Wire the capability response into daemon HTTP routes.
- [ ] Re-run targeted Rust tests until green.

## Task 3: Add frontend runtime and backend HTTP client

- [ ] Write failing Vitest coverage for runtime detection and HTTP RPC handling.
- [ ] Implement runtime config and backend HTTP client modules.
- [ ] Route web-safe business methods in `src/services/tauri.ts` through the HTTP client.
- [ ] Re-run targeted frontend tests until green.

## Task 4: Add realtime event routing for web runtime

- [ ] Write failing tests for event subscription routing in web runtime.
- [ ] Implement backend realtime websocket client.
- [ ] Update `src/services/events.ts` to subscribe to `app-server-event` through daemon WebSocket in web runtime.
- [ ] Re-run targeted frontend tests until green.

## Task 5: Enable minimal web runtime boot

- [ ] Add runtime-aware app boot handling and backend URL config.
- [ ] Hide or safely no-op desktop-only shell paths required for the minimal web vertical slice.
- [ ] Add the web build script and document the runtime expectation.
- [ ] Re-run targeted tests until green.

## Task 6: Validate and clean up

- [ ] Run `npm run typecheck`.
- [ ] Run targeted `npm run test` for touched frontend files.
- [ ] Run `cd src-tauri && cargo check`.
- [ ] Fix regressions and update docs if command surfaces changed.
