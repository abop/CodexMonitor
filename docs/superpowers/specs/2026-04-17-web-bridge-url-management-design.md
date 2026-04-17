# CodexMonitor Web Bridge URL Management Design

## Summary

Add web-only Bridge URL management so the browser build can connect to one of several user-managed bridge servers.

The browser stores the bridge list locally. Users choose the active bridge from the app header. First-time web users must configure and successfully test a bridge before the main app loads. Switching bridges tests the target first, then reconnects the app and refreshes data.

This design keeps bridge selection separate from daemon remote-target settings. The bridge URL is the browser-facing entrypoint. The daemon remains behind the bridge.

## Goals

1. Support multiple bridge servers from one deployed web frontend.
2. Store bridge entries in browser storage only.
3. Require first-time users to configure a working bridge before entering the app.
4. Allow quick bridge switching from the top app chrome.
5. Use a mobile-friendly bottom sheet for bridge selection.
6. Test a bridge before saving or switching to it.
7. Preserve the last selected bridge across browser refreshes.
8. Avoid white screens when no bridge is configured, a bridge is unreachable, or a switch fails.

## Non-Goals

This feature does not add:

- server-side syncing of bridge lists
- user accounts or shared bridge profiles
- daemon token storage in the browser
- Cloudflare Access configuration UI
- daemon remote-target management
- workspace migration between servers
- automatic bridge discovery

## Runtime Assumptions

- This feature is active only in the web build.
- Desktop keeps its current local runtime behavior.
- Cloudflare Access, if used, is handled by the browser session and the deployed bridge URL.
- The bridge URL list contains only browser-facing HTTP(S) URLs.
- Build-time `VITE_CODEXMONITOR_BRIDGE_URL` remains useful as a first-run prefill or fallback seed, but browser-local selection becomes the active source after a user saves a bridge.

## User Experience

### First Visit

If the web build starts without any saved bridge entry, it blocks the main app and opens a setup dialog.

```text
+----------------------------------+
| Connect a Bridge                 |
|                                  |
| Enter a bridge URL before using  |
| the app.                         |
|                                  |
| Name                             |
| [ dev server                   ] |
|                                  |
| Bridge URL                       |
| [ https://bridge.example.com   ] |
|                                  |
| [ Test and Save ]                |
+----------------------------------+
```

The user cannot enter the app until the bridge test succeeds.

If `VITE_CODEXMONITOR_BRIDGE_URL` is present, the setup dialog pre-fills the URL field. The user still confirms it through the same test-and-save flow.

### Daily Use

After configuration, the app header shows the active bridge.

```text
+----------------------------------+
| [ dev server v ]            [ + ]|
+----------------------------------+
|                                  |
| Current app page                 |
|                                  |
+----------------------------------+
```

The header control is web-only. Desktop does not show it.

### Mobile Selection

On mobile widths, tapping the bridge control opens a bottom sheet.

```text
+----------------------------------+
| Select Bridge                    |
|----------------------------------|
| * dev server                     |
|   https://dev.example.com        |
|----------------------------------|
|   build server                   |
|   https://build.example.com      |
|----------------------------------|
| + Add Bridge                     |
| Manage Bridges                   |
+----------------------------------+
```

Selecting another bridge immediately starts the switch flow.

### Desktop Selection

On desktop widths, tapping the bridge control opens a compact popover using the same content model as the mobile sheet.

### Add Bridge

Adding a bridge requires:

- name, optional
- URL, required
- successful connection test

If the name is empty, the app derives a display name from the URL hostname.

### Edit Bridge

Editing a bridge allows changing name and URL.

If the URL changes, the app must test the new URL before saving. If only the name changes, no bridge test is required.

### Delete Bridge

Deletion rules:

- The last remaining bridge cannot be deleted.
- Deleting a non-active bridge removes it immediately after confirmation.
- Deleting the active bridge requires another saved bridge to be selected as the replacement.
- The replacement bridge must test successfully before the active bridge is removed.

## Switching Flow

Switching to another bridge uses a test-before-commit flow.

```text
User selects bridge B
        |
        v
Test bridge B
        |
        +-- failure: stay on bridge A, show an error
        |
        +-- success: set bridge B active
                     close old realtime connection
                     open new realtime connection
                     reload current app data
```

The app must not commit the active bridge change until the test succeeds.

If the switch fails, the current page stays connected to the old bridge and remains usable.

## Data Model

Browser storage uses a versioned record.

```ts
type WebBridgeSettingsV1 = {
  version: 1;
  activeBridgeId: string | null;
  bridges: WebBridgeTarget[];
};

type WebBridgeTarget = {
  id: string;
  name: string;
  baseUrl: string;
  createdAtMs: number;
  updatedAtMs: number;
  lastUsedAtMs: number | null;
};
```

Storage key:

```text
codexmonitor.webBridgeSettings.v1
```

Normalization rules:

- trim leading and trailing whitespace
- require `http:` or `https:`
- remove trailing slashes from the base URL
- allow `http://localhost`, `http://127.0.0.1`, and private development hosts
- warn on plain `http:` for non-local hosts, but do not block it
- reject URLs with unsupported protocols

The stored data must not include daemon tokens or Cloudflare credentials.

## Frontend Architecture

### Bridge Settings Store

Add a small web bridge settings module responsible for:

- reading settings from local storage
- writing settings to local storage
- seeding from build-time config on first run
- normalizing URLs
- validating required fields
- exposing the active bridge
- updating last-used timestamps

This module should be independent from React so it can be tested directly.

### React Provider

Add a web bridge provider near the app root. It owns:

- loaded bridge settings
- active bridge state
- setup-required state
- switching/testing state
- save, edit, delete, and switch actions

The provider exposes the active bridge URL to web transport code.

### Runtime Config Integration

Current web runtime config reads the bridge URL from `VITE_CODEXMONITOR_BRIDGE_URL`. This should become the seed or fallback source, not the only source.

Web transport calls should resolve the bridge URL from the active bridge provider state.

When no bridge is configured, web transport code should return a controlled "bridge not configured" state instead of throwing during render.

### Realtime Integration

Realtime subscriptions must be keyed by active bridge URL.

When the active bridge changes:

- close the previous realtime connection
- create a new realtime connection for the new bridge
- trigger data reloads that depend on the bridge

### UI Components

Add web-only components:

- `WebBridgeGate`
- `WebBridgeSwitcher`
- `WebBridgeSetupDialog`
- `WebBridgePicker`
- `WebBridgeManager`

The gate prevents the main app from rendering before first bridge configuration succeeds.

The switcher lives in the top app chrome. On mobile it opens a bottom sheet. On desktop it opens a popover.

The manager can be launched from the picker and handles add, edit, and delete.

## Error Handling

Errors must be visible and recoverable:

- no bridge configured: setup dialog
- bridge test fails: keep dialog open and show failure
- switch fails: stay on current bridge and show failure
- current bridge becomes unreachable after app load: keep app chrome visible and show a connection error state
- malformed saved storage: ignore invalid entries and fall back to setup or valid entries

No page should white-screen because bridge config is missing or unreachable.

## Testing Plan

### Unit Tests

Cover:

- storage read/write
- storage migration and malformed storage recovery
- URL normalization
- first-run seeding from build-time URL
- name derivation from hostname
- test-before-save behavior
- test-before-switch rollback
- delete rules

### Frontend Tests

Cover:

- first visit shows setup dialog
- invalid URL cannot be saved
- failed test cannot be saved
- successful test saves and enters the app
- header shows active bridge
- selecting another bridge tests and switches
- failed switch keeps the original bridge
- mobile picker renders as a bottom sheet
- refresh reloads the last active bridge

### Manual Browser Validation

Run the web app locally against a real bridge and daemon:

1. Start with empty browser storage and confirm setup dialog blocks entry.
2. Try a bad bridge URL and confirm it cannot be saved.
3. Save a working bridge and confirm the normal UI loads.
4. Add a second working bridge and switch to it.
5. Try switching to a bad bridge and confirm the app stays on the old bridge.
6. Reload the browser and confirm the active bridge is remembered.
7. Repeat the picker flow at a mobile viewport width.

## Acceptance Criteria

The feature is complete when:

- a Cloudflare-hosted web frontend can manage more than one bridge URL from the browser
- first-time web users are forced through a successful bridge setup before entering the app
- desktop behavior is unchanged
- bridge URLs persist across browser refreshes
- users can add, edit, delete, and switch bridge entries
- switching is test-before-commit and rolls back cleanly on failure
- mobile uses a bottom sheet for bridge selection
- missing or bad bridge config does not produce a white screen
- no daemon tokens or Cloudflare credentials are stored by the app
- typecheck and frontend tests pass
