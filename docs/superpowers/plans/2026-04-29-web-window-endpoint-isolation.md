# Web Window Endpoint Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let web runtime windows independently select saved daemon endpoints while retaining a shared default for new ordinary windows.

**Architecture:** Keep saved backend records and the global default in `localStorage`, add a window-scoped backend id in `sessionStorage`, and let `readRuntimeConfig()` resolve URL override, session selection, global default, then env fallback. Update the sidebar web-backend popover so `Use` changes only the current window, `Set as default` updates the shared default, and `Open in new window` opens `?backend=<id>`.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, browser `localStorage`/`sessionStorage`.

---

## Files

- Modify: `src/services/runtime.ts`
  - Add session-scoped current-window backend selection.
  - Add `defaultBackendId` to `RuntimeConfig`.
  - Add runtime APIs for window selection, default selection, and backend URL generation.
  - Allow blank backend names by falling back to normalized URL.
- Modify: `src/services/runtime.test.ts`
  - Cover resolution priority and mutation behavior.
- Modify: `src/features/app/components/SidebarBottomRail.tsx`
  - Replace global `Use` behavior with current-window `Use`.
  - Add `Set as default` and `Open in new window`.
  - Display current/default markers.
  - Save blank names as URL fallback through runtime API.
- Modify: `src/features/app/components/SidebarBottomRail.test.tsx`
  - Cover the new button wiring and optional-name save.
- Modify if type errors require it: `src/App.test.tsx`, `src/services/tauri.test.ts`, `src/services/events.test.ts`, `src/features/app/components/SidebarBottomRail.test.tsx`
  - Add `defaultBackendId` to mocked `RuntimeConfig` objects.

## Task 1: Runtime Resolution

**Files:**
- Modify: `src/services/runtime.test.ts`
- Modify: `src/services/runtime.ts`

- [ ] **Step 1: Write failing runtime tests**

Add imports in `src/services/runtime.test.ts`:

```ts
import {
  buildRuntimeWebBackendWindowUrl,
  getActiveRuntimeWebBackendId,
  isWebRuntime,
  readRuntimeConfig,
  resetRuntimeBackendBaseUrlForTests,
  resolveAppRuntime,
  setActiveRuntimeWebBackend,
  setDefaultRuntimeWebBackend,
  setRuntimeBackendBaseUrl,
  upsertRuntimeWebBackend,
} from "./runtime";
```

Update `afterEach`:

```ts
afterEach(() => {
  vi.unstubAllEnvs();
  resetRuntimeBackendBaseUrlForTests();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});
```

Add tests:

```ts
it("prefers backend query parameter over session and default backend", () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  window.localStorage.setItem(
    "codexmonitor.web-backends",
    JSON.stringify({
      version: 1,
      activeBackendId: "backend-1",
      backends: [
        { id: "backend-1", name: "Local", baseUrl: "http://127.0.0.1:4932", token: null },
        { id: "backend-2", name: "Remote", baseUrl: "https://remote.example.com", token: "secret" },
      ],
    }),
  );
  setActiveRuntimeWebBackend("backend-1");
  window.history.replaceState(null, "", "/chat?backend=backend-2");

  expect(readRuntimeConfig()).toMatchObject({
    backendBaseUrl: "https://remote.example.com",
    backendToken: "secret",
    defaultBackendId: "backend-1",
    activeBackend: { id: "backend-2" },
  });
});

it("stores active backend selection in session storage without changing default", () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  upsertRuntimeWebBackend({ id: "backend-1", name: "Local", baseUrl: "http://127.0.0.1:4932" });
  upsertRuntimeWebBackend({ id: "backend-2", name: "Remote", baseUrl: "https://remote.example.com" });

  setDefaultRuntimeWebBackend("backend-1");
  setActiveRuntimeWebBackend("backend-2");

  expect(readRuntimeConfig()).toMatchObject({
    backendBaseUrl: "https://remote.example.com",
    defaultBackendId: "backend-1",
    activeBackend: { id: "backend-2" },
  });
  expect(getActiveRuntimeWebBackendId()).toBe("backend-2");
});

it("uses normalized url as the name when backend name is blank", () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

  const backend = upsertRuntimeWebBackend({
    name: "   ",
    baseUrl: "https://daemon.example.com/",
  });

  expect(backend.name).toBe("https://daemon.example.com");
  expect(readRuntimeConfig().activeBackend).toMatchObject({
    name: "https://daemon.example.com",
    baseUrl: "https://daemon.example.com",
  });
});

it("builds new-window backend urls by preserving unrelated url parts", () => {
  window.history.replaceState(null, "", "/agents?pane=threads#active");

  expect(buildRuntimeWebBackendWindowUrl("backend-2")).toBe(
    "http://localhost:3000/agents?pane=threads&backend=backend-2#active",
  );
});
```

- [ ] **Step 2: Run runtime tests and verify failure**

Run:

```bash
npm run test -- src/services/runtime.test.ts
```

Expected: FAIL because the new runtime exports and `defaultBackendId` do not exist.

- [ ] **Step 3: Implement runtime APIs**

In `src/services/runtime.ts`:

```ts
const WEB_BACKEND_STORAGE_KEY = "codexmonitor.web-backends";
const WEB_BACKEND_SESSION_STORAGE_KEY = "codexmonitor.web-active-backend-id";

export type RuntimeConfig = {
  runtime: AppRuntime;
  backendBaseUrl: string | null;
  backendToken: string | null;
  activeBackend: RuntimeWebBackend | null;
  defaultBackendId: string | null;
};
```

Add session storage helper:

```ts
function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
```

Change name normalization for saves:

```ts
function normalizeBackendName(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
```

In `upsertRuntimeWebBackend`, replace name validation with URL fallback:

```ts
const name = normalizeBackendName(input.name) ?? baseUrl;
if (!baseUrl) {
  throw new Error("Backend URL is required.");
}
```

Add helpers:

```ts
function readWindowBackendId(): string | null {
  const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const urlBackendId = params?.get("backend")?.trim();
  if (urlBackendId) {
    return urlBackendId;
  }
  return getSessionStorage()?.getItem(WEB_BACKEND_SESSION_STORAGE_KEY)?.trim() || null;
}

function writeWindowBackendId(id: string | null) {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }
  if (id) {
    storage.setItem(WEB_BACKEND_SESSION_STORAGE_KEY, id);
  } else {
    storage.removeItem(WEB_BACKEND_SESSION_STORAGE_KEY);
  }
}

export function getActiveRuntimeWebBackendId() {
  return readWindowBackendId();
}

export function setActiveRuntimeWebBackend(id: string) {
  const backendId = id.trim();
  if (!backendId) {
    throw new Error("Backend id is required.");
  }
  const store = readStoredRuntimeWebBackends();
  if (!store.backends.some((backend) => backend.id === backendId)) {
    throw new Error("Backend not found.");
  }
  runtimeBackendBaseUrlOverride = null;
  writeWindowBackendId(backendId);
  notifyRuntimeConfigListeners();
}

export function setDefaultRuntimeWebBackend(id: string) {
  const backendId = id.trim();
  if (!backendId) {
    throw new Error("Backend id is required.");
  }
  const store = readStoredRuntimeWebBackends();
  if (!store.backends.some((backend) => backend.id === backendId)) {
    throw new Error("Backend not found.");
  }
  runtimeBackendBaseUrlOverride = null;
  writeStoredRuntimeWebBackends({ ...store, activeBackendId: backendId });
  notifyRuntimeConfigListeners();
}
```

Add URL builder:

```ts
export function buildRuntimeWebBackendWindowUrl(id: string) {
  if (typeof window === "undefined") {
    return `?backend=${encodeURIComponent(id)}`;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("backend", id);
  return url.toString();
}
```

Update backend resolution:

```ts
function resolveStoredBackendById(id: string | null): RuntimeWebBackend | null {
  if (!id) {
    return null;
  }
  return readStoredRuntimeWebBackends().backends.find((backend) => backend.id === id) ?? null;
}

function resolveStoredActiveBackend(): RuntimeWebBackend | null {
  const store = readStoredRuntimeWebBackends();
  return resolveStoredBackendById(readWindowBackendId()) ??
    (store.activeBackendId
      ? store.backends.find((backend) => backend.id === store.activeBackendId) ?? null
      : null);
}
```

Update `readRuntimeConfig()` to include `defaultBackendId`, including the runtime override branch.

Update `deleteRuntimeWebBackend()` so if the deleted id equals `readWindowBackendId()`, it calls `writeWindowBackendId(null)` before notifying listeners.

Update `resetRuntimeBackendBaseUrlForTests()` to clear the session key.

- [ ] **Step 4: Run runtime tests and verify pass**

Run:

```bash
npm run test -- src/services/runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit runtime work**

```bash
git add src/services/runtime.ts src/services/runtime.test.ts
git commit -m "feat(web): isolate backend selection per window"
```

## Task 2: Sidebar Backend Controls

**Files:**
- Modify: `src/features/app/components/SidebarBottomRail.test.tsx`
- Modify: `src/features/app/components/SidebarBottomRail.tsx`

- [ ] **Step 1: Write failing sidebar tests**

Update the runtime mock to include:

```ts
buildRuntimeWebBackendWindowUrl: vi.fn((id: string) => `http://localhost:3000/?backend=${id}`),
setDefaultRuntimeWebBackend: vi.fn(),
```

Add `defaultBackendId` to all mocked runtime config objects.

Add tests:

```tsx
it("uses a saved backend only in the current window", () => {
  vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
    runtime: "web",
    backendBaseUrl: "https://one.example.com",
    backendToken: null,
    defaultBackendId: "backend-1",
    activeBackend: { id: "backend-1", name: "One", baseUrl: "https://one.example.com", token: null },
  } as never);
  vi.mocked((runtime as any).listRuntimeWebBackends).mockReturnValue([
    { id: "backend-1", name: "One", baseUrl: "https://one.example.com", token: null },
    { id: "backend-2", name: "Two", baseUrl: "https://two.example.com", token: null },
  ]);

  render(<SidebarBottomRail {...baseProps} />);
  fireEvent.click(screen.getByRole("button", { name: "Web Backend" }));
  fireEvent.click(screen.getByRole("button", { name: "Use Two" }));

  expect(runtime.setActiveRuntimeWebBackend).toHaveBeenCalledWith("backend-2");
  expect((runtime as any).setDefaultRuntimeWebBackend).not.toHaveBeenCalled();
});

it("sets a saved backend as the default for new windows", () => {
  vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
    runtime: "web",
    backendBaseUrl: "https://one.example.com",
    backendToken: null,
    defaultBackendId: "backend-1",
    activeBackend: { id: "backend-1", name: "One", baseUrl: "https://one.example.com", token: null },
  } as never);
  vi.mocked((runtime as any).listRuntimeWebBackends).mockReturnValue([
    { id: "backend-1", name: "One", baseUrl: "https://one.example.com", token: null },
    { id: "backend-2", name: "Two", baseUrl: "https://two.example.com", token: null },
  ]);

  render(<SidebarBottomRail {...baseProps} />);
  fireEvent.click(screen.getByRole("button", { name: "Web Backend" }));
  fireEvent.click(screen.getByRole("button", { name: "Set Two as default" }));

  expect((runtime as any).setDefaultRuntimeWebBackend).toHaveBeenCalledWith("backend-2");
});

it("opens a saved backend in a new browser window", () => {
  const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);
  vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
    runtime: "web",
    backendBaseUrl: "https://one.example.com",
    backendToken: null,
    defaultBackendId: "backend-1",
    activeBackend: { id: "backend-1", name: "One", baseUrl: "https://one.example.com", token: null },
  } as never);
  vi.mocked((runtime as any).listRuntimeWebBackends).mockReturnValue([
    { id: "backend-1", name: "One", baseUrl: "https://one.example.com", token: null },
  ]);

  render(<SidebarBottomRail {...baseProps} />);
  fireEvent.click(screen.getByRole("button", { name: "Web Backend" }));
  fireEvent.click(screen.getByRole("button", { name: "Open One in new window" }));

  expect(openSpy).toHaveBeenCalledWith("http://localhost:3000/?backend=backend-1", "_blank", "noopener,noreferrer");
});
```

- [ ] **Step 2: Run sidebar tests and verify failure**

Run:

```bash
npm run test -- src/features/app/components/SidebarBottomRail.test.tsx
```

Expected: FAIL because new buttons and mock exports are not wired.

- [ ] **Step 3: Implement sidebar controls**

Update imports in `SidebarBottomRail.tsx`:

```ts
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Star from "lucide-react/dist/esm/icons/star";
```

Update runtime imports:

```ts
buildRuntimeWebBackendWindowUrl,
setDefaultRuntimeWebBackend,
```

Add handlers:

```ts
const defaultWebBackendId = runtimeConfig.defaultBackendId;

const setDefaultWebBackend = (backendId: string) => {
  try {
    setDefaultRuntimeWebBackend(backendId);
    setWebBackendError(null);
  } catch (error) {
    setWebBackendError(error instanceof Error ? error.message : "Unable to set default web backend.");
  }
};

const openWebBackendInNewWindow = (backend: RuntimeWebBackend) => {
  const opened = window.open(
    buildRuntimeWebBackendWindowUrl(backend.id),
    "_blank",
    "noopener,noreferrer",
  );
  if (!opened) {
    setWebBackendError("Unable to open a new window for this backend.");
    return;
  }
  setWebBackendError(null);
};
```

For each backend row:

```tsx
const isActive = activeWebBackend?.id === backend.id;
const isDefault = defaultWebBackendId === backend.id;
```

Render controls with accessible labels:

```tsx
{isActive ? (
  <span className="sidebar-web-backend-badge">Current</span>
) : (
  <button
    type="button"
    className="secondary sidebar-web-backend-row-button"
    onClick={() => activateWebBackend(backend.id)}
    aria-label={`Use ${backend.name}`}
  >
    Use
  </button>
)}
{isDefault ? (
  <span className="sidebar-web-backend-badge">Default</span>
) : (
  <button
    type="button"
    className="ghost sidebar-web-backend-icon-button"
    onClick={() => setDefaultWebBackend(backend.id)}
    aria-label={`Set ${backend.name} as default`}
    title="Set as default"
  >
    <Star size={12} aria-hidden />
  </button>
)}
<button
  type="button"
  className="ghost sidebar-web-backend-icon-button"
  onClick={() => openWebBackendInNewWindow(backend)}
  aria-label={`Open ${backend.name} in new window`}
  title="Open in new window"
>
  <ExternalLink size={12} aria-hidden />
</button>
```

Keep the existing edit and delete icon buttons after these controls.

- [ ] **Step 4: Run sidebar tests and verify pass**

Run:

```bash
npm run test -- src/features/app/components/SidebarBottomRail.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit sidebar work**

```bash
git add src/features/app/components/SidebarBottomRail.tsx src/features/app/components/SidebarBottomRail.test.tsx
git commit -m "feat(web): add per-window backend controls"
```

## Task 3: Typecheck And Full Frontend Validation

**Files:**
- Modify only if typecheck reports stale mocks: `src/App.test.tsx`
- Modify only if typecheck reports stale mocks: `src/services/tauri.test.ts`
- Modify only if typecheck reports stale mocks: `src/services/events.test.ts`
- Modify only if typecheck reports stale mocks: `src/features/app/components/SidebarBottomRail.test.tsx`

- [ ] **Step 1: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS. If TypeScript reports missing `defaultBackendId`, add `defaultBackendId: null` or the expected backend id to the mocked `RuntimeConfig` object in that test file.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 3: Commit validation fixes when validation changed files**

If files changed:

```bash
git add src
git commit -m "test(web): update runtime backend mocks"
```

If no files changed, do not create an empty commit.

## Task 4: PR And Pages Preview

**Files:**
- No source files expected.

- [ ] **Step 1: Verify repository target**

Run:

```bash
git remote -v
```

Expected: `origin` points to `git@github.com:abop/CodexMonitor.git`.

- [ ] **Step 2: Push branch**

Run:

```bash
git push -u origin codex/multi-endpoint
```

Expected: branch pushed to origin.

- [ ] **Step 3: Open PR**

Run:

```bash
gh pr create --base main --head codex/multi-endpoint --title "Support per-window web backend endpoints" --body "Adds per-window web backend selection for the browser runtime, keeps a separate shared default backend, supports ?backend=<id> new-window links, and allows blank backend names to fall back to the normalized URL."
```

Expected: GitHub returns a PR URL.

- [ ] **Step 4: Check CI and locate Pages preview**

Run:

```bash
gh pr checks --watch
gh pr view --json url,mergeStateStatus,mergeable,statusCheckRollup
```

Expected: required checks pass or pending/failing checks are reported with names. Use the check output or PR timeline to locate the Pages preview URL and include it in the final response.

---

## Self-Review

- Spec coverage: The tasks cover window/session selection, URL override, shared default, new-window links, optional names, deletion fallback, UI controls, and validation.
- Placeholder scan: No TBD/TODO/fill-later instructions are present.
- Type consistency: Runtime APIs are named consistently across tests and implementation: `setActiveRuntimeWebBackend`, `setDefaultRuntimeWebBackend`, `buildRuntimeWebBackendWindowUrl`, and `defaultBackendId`.
