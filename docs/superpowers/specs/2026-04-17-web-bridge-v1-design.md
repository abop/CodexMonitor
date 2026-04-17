# CodexMonitor Web Bridge V1 Design

## Summary

Build a browser-accessible CodexMonitor web app by keeping the existing React UI, adding a server-side web bridge, and continuing to use the existing daemon as the execution core.

V1 is a single-user remote workspace console:

- Frontend is deployed to Cloudflare
- Bridge runs on the user's own server
- Daemon runs on the same server side as the bridge
- Cloudflare protects browser access to the bridge
- Browser users can manage remote workspaces, threads, messages, basic Git views, and browser-local image attachments

The design goal is to deliver a stable remote workflow without rewriting the product as a separate web app and without forcing the daemon to become browser-native in V1.

## Goals

1. Reuse the existing frontend UI and application structure as much as practical.
2. Preserve the daemon as the source of truth for workspace, thread, Git, and Codex session behavior.
3. Introduce a web bridge so browser clients never connect directly to the daemon's current TCP protocol.
4. Support a usable V1 workflow:
   - list and open remote workspaces
   - add a workspace by entering an absolute server path
   - view threads
   - create, resume, read, rename, and archive threads
   - send messages
   - receive live thread updates
   - view basic Git state
   - upload browser-local images through file picker
   - paste browser clipboard images
5. Keep desktop and web builds sharing one UI surface, with environment-specific behavior isolated behind adapters.

## Non-Goals

V1 does not aim to match desktop feature parity. The following are explicitly out of scope:

- tray integration
- window controls, drag regions, glass effects, and other desktop chrome behavior
- global shortcuts
- local terminal panel
- local dictation
- auto-update flows
- opening Finder, VS Code, or other local apps from the browser build
- Tailscale helper actions and local daemon lifecycle actions in the web UI
- GitHub issue/PR panels
- drag-and-drop image upload
- server-side image file browsing from the browser
- broad multi-user account support

## Users and Deployment Assumptions

V1 is designed for a single user.

Deployment assumptions:

- the user deploys the frontend to Cloudflare
- the bridge is reachable behind Cloudflare-protected access
- the bridge and daemon run on the same private network or same host
- the daemon remains non-public; the browser talks only to the bridge
- workspaces already live on the server filesystem, and new workspaces can be added by entering absolute server paths manually

## Architecture

The system is split into four layers:

### 1. Cloudflare-hosted frontend

The frontend renders the UI, manages client state, and talks only to the bridge.

It must stop assuming that local desktop capabilities are always present. Instead, it asks for product capabilities through a runtime adapter layer.

### 2. Server-side web bridge

The bridge is the browser-facing backend for the web build.

Its responsibilities are:

- accept browser requests
- enforce a minimal trust boundary after Cloudflare access
- translate browser-friendly request/streaming patterns into the daemon's current protocol
- forward daemon events back to the browser
- normalize web-specific concerns such as connection state, request correlation, and attachment upload handling

Its responsibilities do not include:

- reimplementing daemon business logic
- becoming a second source of truth for workspaces or threads
- introducing a separate long-term product data model

### 3. Existing daemon

The daemon stays responsible for:

- workspace lifecycle
- thread lifecycle
- Codex session orchestration
- Git data
- business rules and shared backend behavior

V1 should minimize changes to daemon behavior. The bridge adapts to the daemon more than the daemon adapts to the bridge.

### 4. Cloudflare security layer

Cloudflare remains in front of the bridge and protects the browser-to-bridge path.

The daemon should not be exposed directly to the public internet for V1.

## Recommended Communication Model

V1 should expose two browser-facing channels from the bridge:

### Request channel

Used for discrete actions:

- list workspaces
- add workspace
- connect workspace
- list threads
- read thread
- create thread
- resume thread
- rename/archive thread
- send message
- request Git snapshots

### Realtime channel

Used for ongoing updates:

- app-server event forwarding
- thread processing state changes
- new items/messages
- attach/detach and reconnect state
- failure and disconnect signaling

This split keeps frontend behavior understandable:

- one-shot actions use request/response
- live state uses a persistent realtime connection

## Frontend Design

### Single UI, dual runtime

The existing UI should remain shared between desktop and web builds.

The key frontend change is replacing direct environment assumptions with explicit runtime capability boundaries.

### Frontend layers

The frontend should be organized into four conceptual layers:

1. UI layer
   - existing components and screens
   - should not care whether the backend is local desktop or remote web

2. Runtime adapter layer
   - decides whether the app is running as desktop or web
   - chooses the correct transport implementation

3. Capability interface layer
   - defines stable app capabilities such as workspaces, threads, messages, realtime events, Git, and settings
   - desktop implementation maps to current Tauri-backed calls
   - web implementation maps to bridge calls

4. Desktop-only capability isolation
   - window chrome
   - tray
   - desktop-specific open/reveal actions
   - updater
   - dictation
   - terminal
   - local daemon management

These features must be hidden, disabled, or replaced cleanly in the web build instead of failing at runtime from shared UI paths.

### Why this structure

This keeps the product from splitting into two apps. The UI remains shared while transport and platform behavior are swapped below it.

It also creates a clean path for incremental migration: V1 can implement only the web capabilities needed for the remote workflow, leaving unsupported features isolated instead of partially broken.

## V1 Functional Scope

### Included

#### Workspaces

- list workspaces already known on the server
- add a workspace by entering an absolute server path
- connect/open a workspace in the app
- display basic workspace metadata needed by the current UI

#### Threads

- list threads
- create a thread
- open/read a thread
- resume a thread
- rename a thread
- archive a thread

#### Messaging and runtime

- send text messages
- interrupt an in-flight run when already supported by the app flow
- receive live updates so the thread view continues to move while work is running

#### Browser-local image input

- select local images from the browser device using file picker
- paste images from the browser clipboard
- send those images with a message
- render sent/received images in the conversation view as supported by the existing product behavior

V1 explicitly excludes drag-and-drop image upload.

#### Basic Git views

- repository status
- diffs
- commit log
- branch list

V1 should prefer read-oriented Git functionality first. Riskier write-heavy Git workflows can follow after the main remote experience is proven stable.

#### Minimal settings

Only settings required for the web experience should surface in V1. Desktop-only settings should remain hidden from the web build.

### Excluded

- desktop-only local file browsing beyond browser-provided file selection
- server filesystem browsing UI
- local terminal sessions
- local process control surfaces
- browser-native notifications
- GitHub panels
- broad settings parity

## Bridge Capability Boundary

V1 bridge support should cover a small, focused capability set rather than mirroring every current Tauri command.

### Workspace group

- list workspaces
- add workspace from absolute path
- connect workspace
- fetch workspace summary data required by the current UI

### Thread group

- list threads
- start thread
- read thread
- resume thread
- rename thread
- archive thread

### Message/runtime group

- send user message
- interrupt current run where already supported
- subscribe/unsubscribe to live thread updates
- forward app-server events needed by the thread UI

### Git group

- get Git status
- get diffs
- get log
- list branches

### Minimal settings group

- fetch web-relevant settings
- update only the settings the web client truly needs

The bridge should not expose the entire desktop command surface in V1. Unsupported commands should be absent rather than present-but-broken.

## Image Handling Design

Browser image support changes the client boundary:

- image sources come from the browser device, not from the server filesystem
- file picker and clipboard are handled entirely in the browser
- the frontend prepares images for bridge upload
- the bridge forwards them to the daemon in the format expected for remote message submission

This keeps image behavior aligned with the user's actual device while avoiding any need for server-side file browsing in V1.

## Failure Handling

V1 must handle failure states explicitly and visibly.

### Bridge unreachable

- show a clear disconnected state
- do not pretend data is current
- provide a simple retry path

### Bridge reachable but daemon unavailable

- distinguish this from a frontend connectivity failure
- show a specific backend-unavailable error state

### Realtime channel disconnect

- surface connection state changes in the UI
- attempt reconnect automatically
- resync the active thread after reconnect

### Invalid workspace path

- reject the add-workspace action with a clear message
- do not insert broken workspace records into the visible list

### Message send failure

- mark the action as failed
- allow retry
- never silently drop the message attempt

### Invalid image input

- reject unsupported, unreadable, or too-large images with a direct explanation
- keep text messaging usable even when image upload fails

## Security Model

V1 is intentionally simple:

- Cloudflare protects ingress to the bridge
- the bridge performs a lightweight secondary trust check rather than trusting all traffic blindly
- the bridge is the only public-facing application backend
- the daemon stays private behind the bridge
- no full multi-user account model is introduced in V1

Because this is single-user V1, the design avoids premature user/account abstractions. If multi-user support becomes necessary later, it should be designed as a separate follow-on project rather than hidden inside this V1.

## Product Behavior in Web Build

The web build should feel intentionally scoped, not incomplete.

That means:

- hide unsupported desktop-only controls
- avoid showing actions that are known to fail in the browser
- keep connection state visible where it matters
- favor a smaller but stable command surface over partial parity

The user should experience V1 as a remote workspace console, not as a broken desktop app inside a browser tab.

## Validation Criteria

The web V1 is considered complete only when all of the following are true:

1. The app loads from Cloudflare-hosted frontend deployment.
2. The browser reaches the bridge only through the protected route.
3. Existing server workspaces are visible.
4. A new workspace can be added by entering an absolute server path.
5. A workspace can be opened and its thread list read.
6. A thread can be created, opened, resumed, renamed, and archived.
7. Text messages can be sent successfully.
8. Local browser-device images can be selected and sent.
9. Clipboard images can be pasted and sent.
10. Active thread content updates live while work is running.
11. Disconnects recover without forcing a broken app reload loop.
12. Basic Git information is viewable.
13. Desktop-only controls that are unsupported on the web are removed or safely hidden.

## Risks and Trade-Offs

### Why not connect the browser directly to the daemon?

Because the current daemon-facing path is not already browser-native, and forcing that change immediately would push transport, security, and compatibility complexity into the wrong layer.

The bridge contains that complexity and keeps daemon changes smaller for V1.

### Why not clone the frontend into a separate web app?

Because the existing React UI already expresses most of the product. The main problem is not the screens; it is the transport and platform coupling underneath them.

Reusing the UI and replacing the adapter layers is lower risk than forking the product surface.

### Why not expose the full command surface in V1?

Because that would turn V1 into a parity project instead of a usable remote workflow release. The design favors finishing one stable path over carrying a large set of partially supported browser behaviors.

## Follow-On Work After V1

Likely next additions after V1 succeeds:

- broader Git write actions
- GitHub panels
- drag-and-drop image upload
- more settings parity
- browser-native notifications if desired
- more polished reconnect and multi-session behavior
- eventual multi-user design, if needed

Those should be separate follow-on scopes rather than hidden expansion inside V1.
