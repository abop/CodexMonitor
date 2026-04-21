# Web Parity Codex Runtime Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only remote Codex runtime summary to the reduced web `Codex` settings section without expanding the backend or bridge surface.

**Architecture:** Reuse the existing `AppSettings` payload already available to the shared settings UI, and render a small read-only summary for `codexBin` and `codexArgs` only in the reduced web `Codex` branch. Keep desktop settings behavior unchanged.

**Tech Stack:** React, TypeScript, Vitest.

---

## Scope Split

This plan covers a narrow `Phase 2C` slice from `docs/superpowers/specs/2026-04-21-web-parity-codex-runtime-summary-design.md`.

Included:

- read-only runtime summary rendering in the reduced web `Codex` section
- targeted web settings coverage
- live parity doc update

Excluded:

- backend or bridge changes
- web editing for `codexBin` or `codexArgs`
- feature flags, Codex update, or additional diagnostics work

## File Structure

Modify:

- `src/features/settings/components/sections/SettingsCodexSection.tsx` - render read-only runtime summary in the reduced web branch.
- `src/features/settings/components/SettingsView.test.tsx` - verify runtime summary visibility and continued read-only behavior.
- `docs/web-desktop-parity.md` - update live-state parity notes.

No Rust or bridge files should change in this slice.

### Task 1: Add Failing Reduced-Web Coverage For Runtime Summary

**Files:**

- Modify: `src/features/settings/components/SettingsView.test.tsx`

- [ ] **Step 1: Add a failing web reduced-Codex test**

Extend `src/features/settings/components/SettingsView.test.tsx` with a web case that renders the reduced `Codex` section using:

- `appSettings.codexBin = "/srv/bin/codex"`
- `appSettings.codexArgs = "--profile remote --dangerously-bypass-approvals"`

Assert that:

- the reduced `Codex` section is visible
- `Default Codex path` and `Default Codex args` appear
- the configured path/args values appear
- editable path/args inputs remain hidden

Run:

```bash
npm run test -- src/features/settings/components/SettingsView.test.tsx
```

Expected: the new summary assertions fail because the reduced web section does not yet render them.

### Task 2: Render The Read-Only Runtime Summary

**Files:**

- Modify: `src/features/settings/components/sections/SettingsCodexSection.tsx`

- [ ] **Step 1: Add display helpers for empty runtime config values**

In `src/features/settings/components/sections/SettingsCodexSection.tsx`, derive summary labels for the reduced web view:

- empty `codexPathDraft` -> `PATH resolution`
- empty `codexArgsDraft` -> `No extra args`

- [ ] **Step 2: Render the runtime summary in the reduced web branch**

Add a small read-only block near the top of the reduced web `Codex` section that shows:

- `Default Codex path`
- `Default Codex args`

Use existing settings typography classes and wrap the values in `<code>` for readability. Add one help line that explains these values come from the connected server's shared Codex app-server settings.

- [ ] **Step 3: Keep existing reduced-web behavior intact**

Do not show:

- editable inputs
- browse / clear / save buttons
- Codex update controls

Doctor and read-only file cards should continue rendering exactly as they do today.

- [ ] **Step 4: Run the targeted settings tests**

Run:

```bash
npm run test -- src/features/settings/components/SettingsView.test.tsx
```

Expected: the new reduced-web runtime summary test passes and existing settings coverage stays green.

### Task 3: Update Live Docs And Run Verification

**Files:**

- Modify: `docs/web-desktop-parity.md`

- [ ] **Step 1: Update the live parity doc**

Document that the reduced web `Codex` section now shows:

- read-only global Codex files when supported
- read-only doctor report when supported
- read-only remote runtime path/args summary from shared app settings

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run test
npm run typecheck
cd src-tauri && cargo check
git diff --check
```

Expected: all commands pass without requiring any new Rust changes.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-04-21-web-parity-codex-runtime-summary-design.md \
  docs/superpowers/plans/2026-04-21-web-parity-codex-runtime-summary.md \
  docs/web-desktop-parity.md \
  src/features/settings/components/SettingsView.test.tsx \
  src/features/settings/components/sections/SettingsCodexSection.tsx
git commit -m "feat: add web codex runtime summary"
```

Expected: one commit capturing the new read-only web runtime summary slice.
