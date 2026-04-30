# Web Window Endpoint Isolation Design

## Goal

Allow the web UI to keep different browser windows connected to different saved
daemon endpoints at the same time. Switching endpoints in one window must not
force other open windows to reconnect.

## Scope

This change applies to the browser web runtime only. The desktop runtime and
the Tauri remote backend settings remain unchanged.

In scope:

- Per-window endpoint selection for saved web backends.
- URL-based endpoint selection with `?backend=<saved-backend-id>`.
- A new "open in new window" action for saved web backends.
- A separate default-backend action for new ordinary windows.
- Optional backend names, with URL-as-name fallback.

Out of scope:

- Direct `backendUrl` or token query parameters.
- Cross-device synchronization of web backend choices.
- Desktop remote backend behavior changes.

## Current Behavior

The web runtime stores saved daemon endpoints in `localStorage` under
`codexmonitor.web-backends`. The same store also carries `activeBackendId`.
`readRuntimeConfig()` resolves one global active backend, and both RPC calls and
WebSocket subscriptions read from that global value. As a result, if two browser
windows are open, selecting another backend in one window can make the other
window switch on refresh or runtime config notification.

Backend names are currently required. This makes quick endpoint entry heavier
than necessary when the URL is already an acceptable label.

## Proposed Behavior

Saved web backends remain shared across windows through `localStorage`.

Each window gets its own current backend selection:

1. URL override: `?backend=<saved-backend-id>`.
2. Window/session selection stored in `sessionStorage`.
3. Global default backend stored in `localStorage.activeBackendId`.
4. Configured environment backend from `VITE_CODEXMONITOR_BACKEND_URL`.

The URL override is strongest. If a window is opened with `?backend=remote-a`,
refreshing that window keeps it connected to `remote-a`. The URL only contains
the saved backend id; endpoint URLs and tokens are not copied into query
parameters.

If a window has no URL override but the user chooses a backend with `Use`, the
choice is written to `sessionStorage` and applies only to that tab/window.
Refreshing that same window keeps the same backend. Other open windows are not
changed.

The global `activeBackendId` becomes the default for new ordinary windows rather
than the live selection for every open window. Users update it with a distinct
`Set as default` action.

## UI Behavior

The existing Web Backend popover keeps listing saved backends.

For each saved backend:

- `Use` switches the current window to that backend.
- `Set as default` sets the backend used by new ordinary windows.
- `Open in new window` opens the current web app URL with `?backend=<id>`.
- Edit and delete keep their existing meanings.

The active row badge represents the current window's backend. A separate
default marker identifies the global default when it differs from the current
window backend.

Adding or editing a backend no longer requires a name. When the name field is
blank, saving uses the normalized backend URL as the backend name. Users may
later edit the name to a friendlier label.

When the first backend is added, it becomes both the shared default and the
current window selection. When later backends are added, the existing default is
preserved unless the user explicitly sets the new backend as default.

## Runtime Model

`src/services/runtime.ts` owns all web backend resolution.

The persisted local store remains version 1:

- `backends`: saved endpoint records
- `activeBackendId`: global default backend id

A new session-scoped key stores the current window backend id. It stores only a
saved backend id, not endpoint secrets.

`RuntimeConfig.activeBackend` represents the current window's resolved backend.
`RuntimeConfig.defaultBackendId` exposes the global default backend id so UI code
does not read storage directly.

Runtime config listeners remain the notification mechanism. Updates that affect
the current window selection notify the current window. Updates to the shared
backend list or global default also notify so the popover stays current.

## URL Handling

The only supported query parameter is:

- `backend`: saved web backend id

If the id exists, the window resolves to that backend. If the id does not exist,
the URL override is ignored and resolution falls through to session selection,
global default, and configured environment backend.

Opening a backend in a new window preserves the current path and unrelated query
parameters while replacing the `backend` parameter. Hash fragments are
preserved.

## Error Handling

If `Use` or `Set as default` receives an unknown backend id, the UI shows the
existing popover error pattern.

If `Open in new window` is blocked by the browser, the action does not change
the current window. The UI shows a concise error in the popover.

Deleting the current window backend clears the session selection if it refers to
that backend, then re-resolves using the normal priority order. Deleting the
global default promotes the first remaining saved backend, matching current
fallback behavior.

## Testing

Frontend tests cover:

- Runtime resolution priority: URL, session selection, global default,
  configured environment backend.
- `Use` updates only the current window selection.
- `Set as default` updates the shared default without changing URL overrides.
- Backend names may be blank and fall back to normalized URLs.
- Deleting a selected backend clears stale current-window selection.
- Sidebar backend controls render and call the correct runtime functions.

Existing web RPC and WebSocket tests continue to pass because they consume
`readRuntimeConfig()` and receive the current window backend.
