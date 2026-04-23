# Daemon HTTP/WS Unified Backend Design

## Summary

Turn `codex-monitor-daemon` into the single business backend for CodexMonitor by
adding first-party HTTP and WebSocket endpoints directly to the daemon. The
frontend will treat the daemon as its canonical backend in web runtime, while
desktop-specific OS integrations remain in the Tauri shell.

This branch does not have a web runtime today, so the design must cover both:

- a daemon-native browser-facing backend surface
- a minimal web runtime that can exercise the shared workspace/thread flow

## Goals

1. Make the daemon expose browser-friendly request/response and realtime
   channels without a separate bridge process.
2. Keep daemon business logic as the source of truth by routing HTTP requests
   into the existing daemon RPC dispatcher rather than reimplementing behavior.
3. Introduce a frontend runtime model that can speak to the daemon directly in
   web runtime.
4. Preserve desktop-only shell capabilities in Tauri instead of forcing them
   through the daemon.
5. Deliver a real vertical slice for web runtime:
   - load app settings and workspaces
   - connect a workspace
   - list/resume threads
   - send messages
   - receive app-server events over WebSocket

## Non-Goals

- Full desktop/web feature parity in one pass.
- Removing existing TCP daemon support in this change.
- Reworking all Tauri shell integrations to browser-compatible equivalents.
- Rebuilding the entire app shell UI around web-specific chrome.

## Architecture

The system is split into two runtime contracts:

### 1. Business Backend Contract

This is the shared contract used by desktop business flows and web runtime.

- transport: HTTP for RPC, WebSocket for realtime
- owner: `codex-monitor-daemon`
- responsibilities:
  - workspace lifecycle
  - thread lifecycle
  - Codex app-server orchestration
  - prompts
  - git data and git actions
  - approvals / request-user-input replies
  - app settings and capability discovery

The daemon HTTP layer is a thin adapter over the existing daemon RPC
dispatcher. The existing daemon JSON-RPC method names remain canonical.

### 2. Desktop Shell Contract

- owner: Tauri app
- responsibilities:
  - window controls
  - tray and menu wiring
  - native dialogs
  - opener / reveal-in-editor
  - updater
  - dictation
  - any other OS-specific integration

These capabilities stay separate from the daemon surface. The browser runtime
either hides them or receives explicit capability=false behavior.

## Daemon Changes

`codex-monitor-daemon` gains a second listener model:

- existing TCP listener remains for compatibility
- new HTTP listener serves:
  - `GET /api/capabilities`
  - `POST /api/rpc`
  - `GET /ws`

The HTTP adapter:

- validates browser origins
- optionally validates auth headers
- enforces a browser-facing allowlist for RPC methods
- calls the existing daemon RPC dispatcher directly
- forwards existing daemon events through WebSocket using the same method/payload
  envelope already used by the TCP transport

This keeps one business core and one event source.

## Frontend Changes

The frontend gains a runtime/backend layer:

- `runtime.ts` decides whether the app is in desktop or web mode.
- `backend/http.ts` performs JSON RPC over HTTP.
- `backend/realtime.ts` subscribes to daemon WebSocket events.
- `services/tauri.ts` routes web-safe business calls through the backend HTTP
  client in web runtime.
- `services/events.ts` routes `app-server-event` through daemon WebSocket in web
  runtime.

Desktop-only shell utilities keep using Tauri APIs. Business calls do not gain a
second browser-only shape; they keep the same method names and params.

## Capability Model

The daemon advertises a `version: 1` capability document describing:

- supported RPC methods
- supported thread controls
- file-related capabilities
- optional operations such as usage snapshot or account login

The web runtime uses this to hide or disable unsupported features instead of
guessing from runtime type alone.

## Security Model

The daemon HTTP surface must be safe to expose behind a reverse proxy:

- CORS allowlist by origin
- optional HTTP auth header enforcement
- method allowlist for browser-facing RPC

Loopback desktop traffic can run without auth when explicitly configured for
local-only development or local desktop startup.

## Minimal Web Runtime Scope

This implementation is complete when the browser build can:

1. boot into the shared app shell
2. talk to the daemon over HTTP/WS
3. load workspaces
4. open a workspace and thread
5. send a message
6. receive and render live app-server updates

Unsupported desktop-only features are hidden or fail with explicit runtime
messages rather than crashing.

## Testing Strategy

- Rust:
  - daemon HTTP route tests
  - capability tests
  - allowlist/auth/origin tests
  - websocket forwarding tests
- Frontend:
  - runtime/backend config tests
  - HTTP client tests
  - event routing tests
  - web runtime gating tests for the minimal vertical slice
- Validation:
  - `npm run typecheck`
  - targeted `npm run test`
  - `cd src-tauri && cargo check`

## Migration Strategy

Phase 1 in this branch:

- add daemon-native HTTP/WS surface
- add web runtime backend client and event routing
- ship the minimal browser-capable workspace/thread flow

Later phases can move more desktop business calls onto the same daemon HTTP/WS
surface for full transport unification, while leaving shell features in Tauri.
