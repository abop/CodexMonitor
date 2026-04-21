# Web Parity Codex Runtime Summary Design

## Summary

This document defines a narrow `Phase 2C` slice for the web build: expose the current remote Codex runtime configuration as a read-only summary inside the reduced web `Codex` settings section.

The slice keeps the existing security posture intact. It does not add new bridge methods, new backend payloads, or any browser write path. It only surfaces `codexBin` and `codexArgs` values that already exist in the shared `AppSettings` payload loaded by the web runtime today.

## Problem

The web build now supports:

- read-only global Codex file preview
- a read-only doctor report

But the reduced web `Codex` settings section still hides the current runtime configuration that explains how the remote server is invoking Codex.

That leaves a visibility gap:

- users can inspect config files and run doctor
- users still cannot quickly tell whether the server is using PATH resolution, a custom Codex binary, or extra default args

This is especially awkward for remote debugging because the browser already has the relevant `AppSettings` data but the UI does not present it.

## Goals

- Show the current remote Codex binary selection in the reduced web `Codex` section.
- Show the current remote default Codex args in the same section.
- Keep the section read-only and clearly scoped to inspection only.
- Reuse existing shared settings data and avoid any new RPC surface.

## Non-Goals

- No new backend, daemon, or bridge methods.
- No web editing of Codex path or args.
- No config-origin inference beyond the existing shared app settings model.
- No Codex update or feature-flag work in this slice.

## Constraints

- The web reduced `Codex` section must remain capability-gated the same way it is today.
- Desktop behavior must remain unchanged.
- The browser must not gain any new remote mutation ability.
- The UI should make it obvious that the values are remote server settings, not browser-local state.

## Proposed Approach

Extend the reduced web branch of `SettingsCodexSection` so it always renders a small read-only runtime summary before the optional doctor and file cards.

The summary should show:

- `Default Codex path`
- `Default Codex args`

Display rules:

- if `codexBin` is empty, show `PATH resolution`
- if `codexArgs` is empty, show `No extra args`
- otherwise show the configured values in monospace text

The summary should include brief help text that says these values come from the connected server's shared Codex app-server settings.

## Why This Approach

This is the lowest-cost `Phase 2C` slice with clear user value:

- it improves remote environment visibility
- it introduces no new transport or security risk
- it reuses data already loaded by `get_app_settings`
- it keeps desktop and web sharing one settings section, with web still using reduced read-only rendering

## File Impact

Modify:

- `src/features/settings/components/sections/SettingsCodexSection.tsx`
- `src/features/settings/components/SettingsView.test.tsx`
- `docs/web-desktop-parity.md`

No backend or bridge files should change for this slice.

## Testing Strategy

- Add a web reduced-Codex test that asserts the runtime summary appears with custom `codexBin` and `codexArgs`.
- Verify the same reduced view still hides desktop-only mutation controls.
- Run targeted `SettingsView` tests first, then full `npm run test`, `npm run typecheck`, `cargo check`, and `git diff --check`.

## Success Criteria

This slice is complete when:

- web users can open the reduced `Codex` section and see the current remote path/args summary
- the view remains read-only
- no backend or bridge surface expands
- live parity docs mention the new shared read-only runtime summary
