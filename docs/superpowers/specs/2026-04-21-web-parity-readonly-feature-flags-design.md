# Web Parity Read-Only Feature Flags Design

## Summary

This document defines a narrow `Phase 3` slice for the web build: expose read-only Codex feature-flag visibility from the browser without allowing web callers to mutate feature state or reveal local config files.

The slice should reuse the existing `experimental_feature_list` backend surface, route it through the web bridge, advertise it as `operations.featureFlags`, and add a reduced web `Features` settings section for inspection only.

## Problem

CodexMonitor already has:

- backend support for `experimental_feature_list`
- a full desktop `Features` settings section
- a bridge capability shape with `operations.featureFlags`

But the web build still hides the entire `Features` section and hard-rejects feature-list reads in `src/services/tauri.ts`.

That leaves a visibility gap:

- browser users cannot inspect which stable or experimental features the connected server currently exposes
- support and debugging workflows still require desktop for a read-only question

## Goals

- Expose read-only feature-flag visibility in web runtime.
- Keep feature mutation desktop-only.
- Keep config reveal/open actions desktop-only.
- Reuse existing shared UI where possible instead of building a separate feature browser.

## Non-Goals

- No web support for `set_codex_feature_flag`.
- No web support for opening or revealing `config.toml`.
- No web support for mutating `personality`, `pauseQueuedMessagesWhenResponseRequired`, or other app-settings-backed feature controls from the reduced feature view.
- No change to desktop feature-management behavior.

## Constraints

- The browser must gain only the list/read surface, not the write surface.
- The reduced web `Features` section must remain visually clear that it is read-only.
- Web feature visibility should be capability-gated, not inferred by runtime alone.

## Proposed Approach

### Bridge and service routing

- Add `experimental_feature_list` to the bridge allowlist.
- Set `operations.featureFlags = true` when the bridge supports the read-only list.
- Update `getExperimentalFeatureList()` in `src/services/tauri.ts` so web runtime uses `invokeSupportedRpc("experimental_feature_list", ...)`.
- Keep `setCodexFeatureFlag()` desktop-only.

### Reduced web settings behavior

Expose the `Features` section in web only when `operations.featureFlags` is true.

In reduced web mode, the section should:

- hide the `Config file` row
- hide mutable app-settings feature rows such as `Personality` and `Pause queued messages when a response is required`
- show stable and experimental feature rows returned by Codex
- render their toggle state as disabled / non-interactive
- include read-only explanatory copy

Desktop mode should keep the existing full management UI.

## Why This Approach

This yields the highest-value remaining diagnostics slice with minimal risk:

- the backend and daemon routes already exist
- the bridge only needs a read-only allowlist addition
- the shared settings UI can be adapted instead of duplicated
- the web build gains visibility without acquiring configuration mutation power

## File Impact

Modify:

- `src-tauri/src/shared/web_runtime_capabilities.rs`
- `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- `src/services/tauri.ts`
- `src/services/tauri.test.ts`
- `src/features/settings/components/settingsViewConstants.ts`
- `src/features/settings/hooks/useSettingsViewOrchestration.ts`
- `src/features/settings/hooks/useSettingsFeaturesSection.ts`
- `src/features/settings/components/sections/SettingsFeaturesSection.tsx`
- `src/features/settings/components/SettingsView.test.tsx`
- `docs/web-desktop-parity.md`

No other feature-mutation or config-reveal surfaces should change.

## Testing Strategy

- Add failing bridge tests for capability advertising and forwarding.
- Add failing service tests for web routing of `getExperimentalFeatureList()`.
- Add failing settings tests for reduced read-only web `Features` visibility and disabled controls.
- Run targeted tests first, then full `npm run test`, `npm run typecheck`, `cargo check`, and `git diff --check`.

## Success Criteria

This slice is complete when:

- web users can open a reduced `Features` section when `operations.featureFlags` is available
- they can inspect stable and experimental feature states
- all mutation and config-reveal controls remain desktop-only
- live parity docs describe the new read-only web feature visibility accurately
