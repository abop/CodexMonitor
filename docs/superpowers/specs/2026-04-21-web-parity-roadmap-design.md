# CodexMonitor Web/Desktop Parity Roadmap Design

## Summary

This document defines the long-horizon roadmap for closing the most important web versus desktop capability gaps after Web Bridge V1.

The roadmap targets three priorities, in order:

1. Advanced thread workflows.
2. Remote file and environment visibility with a security-first model.
3. Read-only operational and diagnostics workflows.

The recommended delivery strategy is security foundation first, then high-value thread workflows, then read-only remote file and environment visibility, and finally web-safe diagnostics. The roadmap does not target full desktop parity. Desktop-native shell and OS integrations remain desktop-only unless they later gain a clear remote-safe design.

## Product Direction

The web build should become a complete remote workspace console for server-hosted Codex usage without inheriting unsafe local-desktop assumptions.

The web experience should favor:

- high-value thread control that keeps long-running work manageable from the browser
- remote-safe visibility into workspace state, configuration, and environment
- operational insight that helps debug remote usage without granting system mutation by default

The web experience should not assume:

- unrestricted filesystem mutation
- arbitrary local-app integration from the browser
- parity for tray, updater, native notifications, or window chrome
- parity for machine-local setup helpers that only make sense in a desktop shell

## Scope Assumptions

- Time horizon: long-term roadmap until the web build covers the key remote workflows expected from the product.
- Audience: product and engineering.
- File and environment scope: remote server only.
- Default safety model: read-only first.
- Sequencing rule: build the security foundation before opening broader file or environment access.

## Decision Drivers

The roadmap is shaped by four drivers:

1. User value: advanced thread workflows unblock browser users immediately and have a clear parity gap today.
2. Security: remote file and environment access needs stronger policy controls than the current web bridge allowlist model.
3. Implementation cost: thread workflow parity is smaller than safe file and environment parity.
4. Product clarity: diagnostics should help explain remote state, while desktop-native system controls should stay intentionally out of scope until they have a browser-safe design.

## Effort Bands

- `M`: localized work across a few layers with moderate UI adaptation.
- `L`: multi-surface work that touches transport, state, and UI orchestration.
- `XL`: broad work that needs new policy, transport shape, and UI design across several feature areas.

## Recommended Roadmap

### Phase 0: Security Baseline and Capability Model

Effort: `M`

Deliver a capability model that the web bridge and frontend can both reason about before broader parity work expands the remote surface.

Core outcomes:

- Add explicit capability categories instead of relying only on method allowlists.
- Introduce method-level and resource-level policy checks for remote file and environment access.
- Define path, file-kind, text-size, truncation, and binary-handling rules for remote reads.
- Add audit points for sensitive reads and permission-denied outcomes.
- Expose capability detection to the frontend so shared UI can clearly hide, disable, or explain unavailable actions.

Why this phase comes first:

- Current web controls are mostly transport-level allowlists in `src/services/tauri.ts` and `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`.
- Remote file logic already has policy-oriented primitives in `src-tauri/src/shared/files_core.rs`, which creates a good base for a stricter capability layer.
- Later file, environment, and diagnostics work should inherit one policy model instead of adding one-off checks per method.

### Phase 1: Advanced Thread Workflows

Effort: `L`

Bring the highest-value thread actions to the web build after the minimum security baseline is in place.

Phase 1A:

- `Steer` follow-up sends.
- `fork_thread`.
- `compact_thread`.

Phase 1B:

- `start_review` for working tree, branch, and commit review flows.
- detached review-thread lifecycle support where required by the shared UI.
- `list_mcp_server_status` summary visibility.

Expected outcome:

- Browser users can keep active threads moving with `Steer`, create alternate exploration branches with thread fork, reduce thread size with compact, start the main review flows, and inspect MCP availability without switching to desktop.

Implementation notes:

- `Steer`, thread fork, compact, review start, and MCP status are currently blocked by web bridge support gaps in `src/services/tauri.ts`.
- Review flows also touch thread orchestration in `src/features/threads/hooks/useThreadMessaging.ts`, `src/features/threads/hooks/useThreadActions.ts`, `src/features/threads/hooks/useReviewPrompt.ts`, and `src/features/threads/hooks/useDetachedReviewTracking.ts`.
- Pull-request-specific review actions can remain deferred until the GitHub surface is intentionally revisited.

### Phase 2: Read-Only Remote Files and Environment Visibility

Effort: `XL`

Add browser-safe visibility into workspace files and environment-related state using a read-only model.

Phase 2A:

- Workspace file tree.
- File preview for supported text content.
- File search and snippet insertion into the composer.

Phase 2B:

- Read-only visibility for workspace `AGENTS.md`.
- Read-only visibility for global `AGENTS.md`.
- Read-only visibility for global Codex config and agent config surfaces that are already modeled in shared UI.

Phase 2C:

- Read-only environment metadata and configuration origin where the backend can expose it safely.
- Read-only runtime arguments, selected config source, and similar explanatory state needed to understand remote behavior.

Required safety boundaries:

- Restrict access to workspace roots and approved config locations only.
- Default to text-first rendering and explicit truncation for large files.
- Deny arbitrary path reads outside approved scopes.
- Keep browser flows out of local-app reveal and open-in-editor behavior.
- Do not introduce remote write access in this phase.

Expected outcome:

- Browser users can inspect remote files and configuration, attach file context to prompts, and understand environment state without needing shell access or desktop-only filesystem integration.

Implementation notes:

- Current desktop file tree and preview flows depend on desktop runtime wiring in `src/features/files` and file commands gated in `src/services/tauri.ts`.
- Shared backend logic should centralize remote read policy rather than duplicating validation in the bridge and frontend.

### Phase 3: Read-Only Operations and Diagnostics

Effort: `M-L`

Expose remote-safe operational insight that helps users understand health, usage, and runtime state from the browser.

Recommended scope:

- `local_usage_snapshot` equivalent where the data source is valid for remote usage.
- doctor-style diagnostics report that remains read-only.
- experimental feature visibility in read-only form.
- build, runtime, and connection metadata that helps explain the current server state.

Explicit exclusions for this phase:

- daemon lifecycle mutation from the browser
- Tailscale helper control actions
- updater install flows
- tray, native menu, and window-shell integrations

Expected outcome:

- Browser users can inspect health and usage state, understand why a server behaves a certain way, and gather support information without being granted server mutation powers.

### Phase 4: Hardening, Cleanup, and Optional Expansion

Effort: `M`

Finish the parity program by tightening the shared UX and deciding which areas should remain desktop-only.

Core outcomes:

- Remove or better gate misleading shared UI entry points that still imply unsupported web behavior.
- Add capability-aware empty states, denied-state messaging, and reconnect recovery where missing.
- Expand audit logging and supportability for remote-sensitive actions.
- Re-evaluate whether any narrowly scoped write actions are worth introducing later.

Default recommendation:

- Do not pre-commit to remote write access.
- Keep desktop-native shell features desktop-only unless a future design shows strong user value and a safe browser model.

## Dependency Order

Phase dependencies:

- Phase 0 is the hard prerequisite for broader file, environment, and diagnostics work.
- Phase 1 can start once the minimum capability model and policy hooks from Phase 0 exist.
- Phase 2 and Phase 3 can overlap after Phase 0, but Phase 2 should keep the stricter design bar because its surface is more security-sensitive.

Recommended execution order with constrained staffing:

1. Phase 0.
2. Phase 1A.
3. Phase 1B.
4. Phase 2A.
5. Phase 3 read-only diagnostics subset.
6. Phase 2B and Phase 2C.
7. Phase 4.

## Delivery Principles

- Reuse shared backend logic in `src-tauri/src/shared/*` before adding app- or bridge-specific behavior.
- Keep web and desktop sharing one UI wherever capability gating can preserve clarity.
- Prefer explicit capability reporting over hidden runtime failure.
- Favor read-only introspection before any remote mutation.
- Avoid parity work that only reproduces desktop shell affordances without improving remote workflows.

## Areas Expected to Stay Desktop-Only

These areas should remain desktop-only unless later designs intentionally change that decision:

- native window chrome, tray, and menu integrations
- local editor and file-manager reveal/open actions
- local terminal sessions
- dictation capture and model management
- updater install flows
- machine-local daemon lifecycle and Tailscale control actions

## Success Criteria

The roadmap is successful when the web build can serve as a credible primary interface for remote Codex usage without asking users to fall back to desktop for routine thread control, remote inspection, or operational visibility.

At that point:

- advanced thread control works from the browser
- remote files and configuration are inspectable under a clear read-only model
- operational state is understandable from the browser
- unsupported desktop-only affordances are clearly separated instead of partially exposed

## Source of Truth

- Current parity snapshot: `docs/web-desktop-parity.md`
- Web runtime RPC gating: `src/services/tauri.ts`
- Bridge method allowlist: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- Shared file policy primitives: `src-tauri/src/shared/files_core.rs`
- Thread action wiring: `src/features/threads/hooks/useThreadActions.ts`
- Thread messaging orchestration: `src/features/threads/hooks/useThreadMessaging.ts`
