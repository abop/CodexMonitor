# Web Bridge URL Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the web build manage, persist, test, and switch between multiple browser-local Bridge URLs.

**Architecture:** Add a focused web bridge feature module that owns browser storage, React state, setup gating, and UI. Keep transport code in `src/services/*`, but make web transport read the active bridge URL from runtime state instead of only from build-time env. Use a test-before-commit flow and reload the web app after a successful switch so existing bootstrap state cannot leak across servers.

**Tech Stack:** React, TypeScript, Vite env, localStorage, existing DS modal/popover primitives, Vitest, Testing Library.

---

## File Structure

Create:

- `src/features/webBridge/types.ts` - shared web bridge types.
- `src/features/webBridge/webBridgeStorage.ts` - pure storage, URL normalization, entry mutation helpers.
- `src/features/webBridge/webBridgeStorage.test.ts` - unit coverage for storage and normalization.
- `src/features/webBridge/WebBridgeProvider.tsx` - React state provider and actions.
- `src/features/webBridge/WebBridgeProvider.test.tsx` - provider behavior coverage.
- `src/features/webBridge/WebBridgeGate.tsx` - first-run web gate.
- `src/features/webBridge/WebBridgeGate.test.tsx` - gate rendering coverage.
- `src/features/webBridge/WebBridgeSetupDialog.tsx` - required first-run setup dialog.
- `src/features/webBridge/WebBridgeSwitcher.tsx` - top bridge switcher.
- `src/features/webBridge/WebBridgePicker.tsx` - desktop popover/mobile sheet selection content.
- `src/features/webBridge/WebBridgeManager.tsx` - add/edit/delete management modal.
- `src/features/webBridge/WebBridgeSwitcher.test.tsx` - UI flow coverage.
- `src/features/webBridge/index.ts` - feature exports.
- `src/styles/web-bridge.css` - feature styling.

Modify:

- `src/App.tsx` - import CSS and wrap `MainApp` with web bridge provider/gate.
- `src/services/runtime.ts` - add runtime bridge URL override and subscription helpers.
- `src/services/runtime.test.ts` - cover dynamic bridge URL behavior.
- `src/services/bridge/http.ts` - make RPC parsing stricter and add bridge test helper.
- `src/services/bridge/http.test.ts` - cover strict parsing and bridge test helper.
- `src/services/tauri.ts` - use the dynamic bridge URL and clearer no-bridge error.
- `src/services/tauri.test.ts` - cover saved bridge override and missing-bridge failure.
- `src/services/bridge/realtime.ts` - add explicit close method.
- `src/services/events.ts` - expose a bridge realtime reset helper.
- `src/services/events.test.ts` - cover websocket URL from saved bridge and reset behavior.
- `src/features/app/components/MainAppShell.tsx` - render the web-only switcher.
- `src/features/app/components/MainAppShell.test.tsx` - assert switcher appears only in web runtime.

Do not modify Rust backend files for this feature.

## Task 1: Storage and URL Helpers

**Files:**

- Create: `src/features/webBridge/types.ts`
- Create: `src/features/webBridge/webBridgeStorage.ts`
- Create: `src/features/webBridge/webBridgeStorage.test.ts`

- [ ] **Step 1: Write failing storage tests**

Create `src/features/webBridge/webBridgeStorage.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  WEB_BRIDGE_STORAGE_KEY,
  addWebBridgeTarget,
  deleteWebBridgeTarget,
  deriveBridgeName,
  editWebBridgeTarget,
  loadWebBridgeSettings,
  normalizeWebBridgeUrl,
  saveWebBridgeSettings,
} from "./webBridgeStorage";

describe("webBridgeStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes http and https bridge URLs", () => {
    expect(normalizeWebBridgeUrl(" https://bridge.example.com/// ")).toEqual({
      ok: true,
      value: "https://bridge.example.com",
      warning: null,
    });
    expect(normalizeWebBridgeUrl("http://127.0.0.1:8787/")).toEqual({
      ok: true,
      value: "http://127.0.0.1:8787",
      warning: null,
    });
  });

  it("rejects empty and non-http bridge URLs", () => {
    expect(normalizeWebBridgeUrl(" ")).toEqual({
      ok: false,
      error: "Bridge URL is required.",
    });
    expect(normalizeWebBridgeUrl("ws://bridge.example.com")).toEqual({
      ok: false,
      error: "Bridge URL must start with http:// or https://.",
    });
  });

  it("warns for plain http on non-local hosts", () => {
    expect(normalizeWebBridgeUrl("http://bridge.example.com")).toEqual({
      ok: true,
      value: "http://bridge.example.com",
      warning: "Plain HTTP should only be used for trusted development hosts.",
    });
  });

  it("derives a display name from the URL hostname", () => {
    expect(deriveBridgeName("", "https://bridge.example.com")).toBe(
      "bridge.example.com",
    );
    expect(deriveBridgeName(" dev server ", "https://bridge.example.com")).toBe(
      "dev server",
    );
  });

  it("seeds first-run settings from build-time URL without saving it", () => {
    const settings = loadWebBridgeSettings({
      seedUrl: "https://seed.example.com/",
      nowMs: 100,
    });

    expect(settings.bridges).toEqual([]);
    expect(settings.activeBridgeId).toBeNull();
    expect(settings.seedBridgeUrl).toBe("https://seed.example.com");
    expect(localStorage.getItem(WEB_BRIDGE_STORAGE_KEY)).toBeNull();
  });

  it("saves and reloads settings", () => {
    const saved = addWebBridgeTarget(
      { version: 1, activeBridgeId: null, bridges: [] },
      {
        name: "dev",
        baseUrl: "https://dev.example.com",
        nowMs: 100,
        activate: true,
      },
    );

    saveWebBridgeSettings(saved);
    expect(loadWebBridgeSettings({ nowMs: 200 })).toMatchObject({
      activeBridgeId: saved.bridges[0].id,
      bridges: [{ name: "dev", baseUrl: "https://dev.example.com" }],
    });
  });

  it("ignores malformed storage and keeps valid seed data available", () => {
    localStorage.setItem(WEB_BRIDGE_STORAGE_KEY, "{bad json");

    expect(loadWebBridgeSettings({ seedUrl: "https://seed.example.com" })).toEqual({
      version: 1,
      activeBridgeId: null,
      bridges: [],
      seedBridgeUrl: "https://seed.example.com",
    });
  });

  it("edits a bridge and keeps it active", () => {
    const settings = addWebBridgeTarget(
      { version: 1, activeBridgeId: null, bridges: [] },
      {
        name: "dev",
        baseUrl: "https://dev.example.com",
        nowMs: 100,
        activate: true,
      },
    );
    const id = settings.bridges[0].id;

    const edited = editWebBridgeTarget(settings, id, {
      name: "build",
      baseUrl: "https://build.example.com",
      nowMs: 200,
    });

    expect(edited.activeBridgeId).toBe(id);
    expect(edited.bridges[0]).toMatchObject({
      id,
      name: "build",
      baseUrl: "https://build.example.com",
      updatedAtMs: 200,
    });
  });

  it("prevents deleting the last bridge", () => {
    const settings = addWebBridgeTarget(
      { version: 1, activeBridgeId: null, bridges: [] },
      {
        name: "dev",
        baseUrl: "https://dev.example.com",
        nowMs: 100,
        activate: true,
      },
    );

    expect(() => deleteWebBridgeTarget(settings, settings.bridges[0].id)).toThrow(
      "At least one Bridge must remain configured.",
    );
  });

  it("deletes a non-active bridge without changing the active bridge", () => {
    const first = addWebBridgeTarget(
      { version: 1, activeBridgeId: null, bridges: [] },
      {
        name: "dev",
        baseUrl: "https://dev.example.com",
        nowMs: 100,
        activate: true,
      },
    );
    const second = addWebBridgeTarget(first, {
      name: "build",
      baseUrl: "https://build.example.com",
      nowMs: 200,
      activate: false,
    });

    const deleted = deleteWebBridgeTarget(second, second.bridges[1].id);
    expect(deleted.activeBridgeId).toBe(first.bridges[0].id);
    expect(deleted.bridges).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the storage test and verify it fails**

Run:

```bash
npm run test -- src/features/webBridge/webBridgeStorage.test.ts
```

Expected: FAIL because `src/features/webBridge/webBridgeStorage.ts` does not exist.

- [ ] **Step 3: Add storage types**

Create `src/features/webBridge/types.ts`:

```ts
export type WebBridgeTarget = {
  id: string;
  name: string;
  baseUrl: string;
  createdAtMs: number;
  updatedAtMs: number;
  lastUsedAtMs: number | null;
};

export type WebBridgeSettings = {
  version: 1;
  activeBridgeId: string | null;
  bridges: WebBridgeTarget[];
};

export type LoadedWebBridgeSettings = WebBridgeSettings & {
  seedBridgeUrl: string | null;
};

export type WebBridgeDraft = {
  name: string;
  baseUrl: string;
};

export type NormalizedBridgeUrlResult =
  | { ok: true; value: string; warning: string | null }
  | { ok: false; error: string };
```

- [ ] **Step 4: Add storage implementation**

Create `src/features/webBridge/webBridgeStorage.ts`:

```ts
import type {
  LoadedWebBridgeSettings,
  NormalizedBridgeUrlResult,
  WebBridgeSettings,
  WebBridgeTarget,
} from "./types";

export const WEB_BRIDGE_STORAGE_KEY = "codexmonitor.webBridgeSettings.v1";

const EMPTY_SETTINGS: WebBridgeSettings = {
  version: 1,
  activeBridgeId: null,
  bridges: [],
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isLocalHttpHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  );
}

function createBridgeId(nowMs: number) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `bridge-${nowMs}-${random}`;
}

function parseSettings(value: string | null): WebBridgeSettings | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Partial<WebBridgeSettings>;
    if (parsed.version !== 1 || !Array.isArray(parsed.bridges)) {
      return null;
    }
    const bridges = parsed.bridges.filter(
      (bridge): bridge is WebBridgeTarget =>
        Boolean(bridge) &&
        typeof bridge.id === "string" &&
        typeof bridge.name === "string" &&
        typeof bridge.baseUrl === "string" &&
        typeof bridge.createdAtMs === "number" &&
        typeof bridge.updatedAtMs === "number",
    );
    const activeBridgeId =
      typeof parsed.activeBridgeId === "string" &&
      bridges.some((bridge) => bridge.id === parsed.activeBridgeId)
        ? parsed.activeBridgeId
        : bridges[0]?.id ?? null;
    return { version: 1, activeBridgeId, bridges };
  } catch {
    return null;
  }
}

export function normalizeWebBridgeUrl(
  value: string | null | undefined,
): NormalizedBridgeUrlResult {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return { ok: false, error: "Bridge URL is required." };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Bridge URL is not a valid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Bridge URL must start with http:// or https://." };
  }
  const normalized = url.toString().replace(/\/+$/, "");
  const warning =
    url.protocol === "http:" && !isLocalHttpHost(url.hostname)
      ? "Plain HTTP should only be used for trusted development hosts."
      : null;
  return { ok: true, value: normalized, warning };
}

export function deriveBridgeName(name: string, baseUrl: string) {
  const trimmed = name.trim();
  if (trimmed) {
    return trimmed;
  }
  return new URL(baseUrl).hostname;
}

export function loadWebBridgeSettings(options: {
  seedUrl?: string | null;
  nowMs?: number;
} = {}): LoadedWebBridgeSettings {
  const saved = canUseStorage()
    ? parseSettings(window.localStorage.getItem(WEB_BRIDGE_STORAGE_KEY))
    : null;
  const seed = normalizeWebBridgeUrl(options.seedUrl ?? null);
  return {
    ...(saved ?? EMPTY_SETTINGS),
    seedBridgeUrl: seed.ok ? seed.value : null,
  };
}

export function saveWebBridgeSettings(settings: WebBridgeSettings) {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(WEB_BRIDGE_STORAGE_KEY, JSON.stringify(settings));
}

export function getActiveWebBridge(settings: WebBridgeSettings) {
  return (
    settings.bridges.find((bridge) => bridge.id === settings.activeBridgeId) ?? null
  );
}

export function addWebBridgeTarget(
  settings: WebBridgeSettings,
  options: {
    name: string;
    baseUrl: string;
    nowMs: number;
    activate: boolean;
  },
): WebBridgeSettings {
  const bridge: WebBridgeTarget = {
    id: createBridgeId(options.nowMs),
    name: deriveBridgeName(options.name, options.baseUrl),
    baseUrl: options.baseUrl,
    createdAtMs: options.nowMs,
    updatedAtMs: options.nowMs,
    lastUsedAtMs: options.activate ? options.nowMs : null,
  };
  return {
    version: 1,
    activeBridgeId: options.activate ? bridge.id : settings.activeBridgeId,
    bridges: [...settings.bridges, bridge],
  };
}

export function editWebBridgeTarget(
  settings: WebBridgeSettings,
  id: string,
  options: { name: string; baseUrl: string; nowMs: number },
): WebBridgeSettings {
  return {
    ...settings,
    bridges: settings.bridges.map((bridge) =>
      bridge.id === id
        ? {
            ...bridge,
            name: deriveBridgeName(options.name, options.baseUrl),
            baseUrl: options.baseUrl,
            updatedAtMs: options.nowMs,
          }
        : bridge,
    ),
  };
}

export function activateWebBridgeTarget(
  settings: WebBridgeSettings,
  id: string,
  nowMs: number,
): WebBridgeSettings {
  if (!settings.bridges.some((bridge) => bridge.id === id)) {
    throw new Error("Bridge not found.");
  }
  return {
    ...settings,
    activeBridgeId: id,
    bridges: settings.bridges.map((bridge) =>
      bridge.id === id ? { ...bridge, lastUsedAtMs: nowMs } : bridge,
    ),
  };
}

export function deleteWebBridgeTarget(
  settings: WebBridgeSettings,
  id: string,
  replacementActiveBridgeId?: string,
): WebBridgeSettings {
  if (settings.bridges.length <= 1) {
    throw new Error("At least one Bridge must remain configured.");
  }
  const bridges = settings.bridges.filter((bridge) => bridge.id !== id);
  const activeBridgeId =
    settings.activeBridgeId === id
      ? replacementActiveBridgeId ?? bridges[0]?.id ?? null
      : settings.activeBridgeId;
  return { version: 1, activeBridgeId, bridges };
}
```

- [ ] **Step 5: Run storage tests**

Run:

```bash
npm run test -- src/features/webBridge/webBridgeStorage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit storage layer**

Run:

```bash
git add src/features/webBridge/types.ts src/features/webBridge/webBridgeStorage.ts src/features/webBridge/webBridgeStorage.test.ts
git commit -m "feat: add web bridge storage"
```

## Task 2: Runtime Transport Integration

**Files:**

- Modify: `src/services/runtime.ts`
- Create: `src/services/runtime.test.ts`
- Modify: `src/services/bridge/http.ts`
- Modify: `src/services/bridge/http.test.ts`
- Modify: `src/services/tauri.ts`
- Modify: `src/services/tauri.test.ts`
- Modify: `src/services/bridge/realtime.ts`
- Modify: `src/services/events.ts`
- Modify: `src/services/events.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Create `src/services/runtime.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readRuntimeConfig,
  resetRuntimeBridgeBaseUrlForTests,
  setRuntimeBridgeBaseUrl,
  subscribeRuntimeBridgeBaseUrl,
} from "./runtime";

describe("runtime bridge URL", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetRuntimeBridgeBaseUrlForTests();
  });

  it("uses the saved runtime bridge before build-time env", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://env.example.com");

    setRuntimeBridgeBaseUrl("https://saved.example.com/");

    expect(readRuntimeConfig()).toMatchObject({
      runtime: "web",
      bridgeBaseUrl: "https://saved.example.com",
    });
  });

  it("notifies listeners when the runtime bridge changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRuntimeBridgeBaseUrl(listener);

    setRuntimeBridgeBaseUrl("https://saved.example.com");

    expect(listener).toHaveBeenCalledWith("https://saved.example.com");
    unsubscribe();
    setRuntimeBridgeBaseUrl("https://next.example.com");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

Run:

```bash
npm run test -- src/services/runtime.test.ts
```

Expected: FAIL because runtime override helpers do not exist.

- [ ] **Step 2: Add runtime bridge override helpers**

Modify `src/services/runtime.ts` so it contains these exports and uses the override in `readRuntimeConfig`:

```ts
let runtimeBridgeBaseUrlOverride: string | null = null;
const runtimeBridgeListeners = new Set<(baseUrl: string | null) => void>();

function normalizeBridgeBaseUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}

export function setRuntimeBridgeBaseUrl(value: string | null) {
  runtimeBridgeBaseUrlOverride = normalizeBridgeBaseUrl(value);
  for (const listener of runtimeBridgeListeners) {
    listener(runtimeBridgeBaseUrlOverride);
  }
}

export function getRuntimeBridgeBaseUrl() {
  return runtimeBridgeBaseUrlOverride;
}

export function subscribeRuntimeBridgeBaseUrl(
  listener: (baseUrl: string | null) => void,
) {
  runtimeBridgeListeners.add(listener);
  return () => runtimeBridgeListeners.delete(listener);
}

export function resetRuntimeBridgeBaseUrlForTests() {
  runtimeBridgeBaseUrlOverride = null;
  runtimeBridgeListeners.clear();
}
```

Update the `bridgeBaseUrl` line in `readRuntimeConfig`:

```ts
bridgeBaseUrl:
  runtimeBridgeBaseUrlOverride ??
  normalizeBridgeBaseUrl(import.meta.env.VITE_CODEXMONITOR_BRIDGE_URL),
```

- [ ] **Step 3: Run runtime tests**

Run:

```bash
npm run test -- src/services/runtime.test.ts
```

Expected: PASS.

- [ ] **Step 4: Write failing bridge HTTP tests**

Extend `src/services/bridge/http.test.ts` with:

```ts
import { testBridgeConnection } from "./http";

it("rejects non JSON-RPC bridge responses", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    }),
  );

  await expect(
    testBridgeConnection({ baseUrl: "https://bridge.example.com" }),
  ).rejects.toThrow("Bridge returned an invalid response.");
});

it("tests bridge connectivity with list_workspaces", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: [] }),
    }),
  );

  await expect(
    testBridgeConnection({ baseUrl: "https://bridge.example.com" }),
  ).resolves.toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledWith(
    "https://bridge.example.com/api/rpc",
    expect.objectContaining({
      body: JSON.stringify({ method: "list_workspaces", params: {} }),
      credentials: "include",
    }),
  );
});
```

Run:

```bash
npm run test -- src/services/bridge/http.test.ts
```

Expected: FAIL because `testBridgeConnection` is missing and `bridgeRpc` accepts `{}` as success.

- [ ] **Step 5: Add strict bridge parsing and test helper**

Modify `src/services/bridge/http.ts`:

```ts
type BridgeRpcPayload<T> =
  | { result: T; error?: never }
  | { result?: never; error: { message?: string } };

function hasBridgeResult<T>(payload: unknown): payload is { result: T } {
  return Boolean(payload) && typeof payload === "object" && "result" in payload;
}

function bridgeErrorMessage(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return null;
}
```

Use the helpers inside `bridgeRpc`:

```ts
const payload = (await response.json().catch(() => ({}))) as BridgeRpcPayload<T>;
const errorMessage = bridgeErrorMessage(payload);
if (!response.ok || errorMessage) {
  throw new Error(errorMessage ?? `Bridge request failed (${response.status})`);
}
if (!hasBridgeResult<T>(payload)) {
  throw new Error("Bridge returned an invalid response.");
}
return payload.result;
```

Add the connectivity helper:

```ts
export async function testBridgeConnection(config: BridgeConfig) {
  await bridgeRpc<unknown[]>(config, "list_workspaces", {});
  return { ok: true as const };
}
```

- [ ] **Step 6: Run bridge HTTP tests**

Run:

```bash
npm run test -- src/services/bridge/http.test.ts
```

Expected: PASS.

- [ ] **Step 7: Update Tauri wrapper tests for saved bridge URL**

Add to `src/services/tauri.test.ts` imports:

```ts
import {
  resetRuntimeBridgeBaseUrlForTests,
  setRuntimeBridgeBaseUrl,
} from "./runtime";
```

In the existing `beforeEach`, after `vi.unstubAllGlobals();`, add:

```ts
resetRuntimeBridgeBaseUrlForTests();
```

Add tests:

```ts
it("routes web RPC through the saved runtime bridge URL", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://env.example.com");
  setRuntimeBridgeBaseUrl("https://saved.example.com");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: [] }),
    }),
  );

  await listWorkspaces();

  expect(fetch).toHaveBeenCalledWith(
    "https://saved.example.com/api/rpc",
    expect.objectContaining({
      body: JSON.stringify({ method: "list_workspaces", params: {} }),
    }),
  );
});

it("fails web RPC clearly when no bridge URL is configured", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

  await expect(listWorkspaces()).rejects.toThrow("Bridge URL is not configured.");
});
```

Run:

```bash
npm run test -- src/services/tauri.test.ts
```

Expected: FAIL until `bridgeConfigOrThrow` uses the updated runtime config error.

- [ ] **Step 8: Update Tauri bridge config error**

Modify `bridgeConfigOrThrow` in `src/services/tauri.ts`:

```ts
function bridgeConfigOrThrow() {
  const config = readRuntimeConfig();
  if (!config.bridgeBaseUrl) {
    throw new Error("Bridge URL is not configured.");
  }
  return { baseUrl: config.bridgeBaseUrl };
}
```

- [ ] **Step 9: Run Tauri wrapper tests**

Run:

```bash
npm run test -- src/services/tauri.test.ts
```

Expected: PASS.

- [ ] **Step 10: Add realtime reset coverage**

Modify `src/services/events.test.ts` imports:

```ts
import { resetBridgeRealtimeClient } from "./events";
import {
  resetRuntimeBridgeBaseUrlForTests,
  setRuntimeBridgeBaseUrl,
} from "./runtime";
```

In `beforeEach`, add:

```ts
resetRuntimeBridgeBaseUrlForTests();
resetBridgeRealtimeClient();
```

Add tests:

```ts
it("uses the saved runtime bridge URL for websocket events", () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://env.example.com");
  setRuntimeBridgeBaseUrl("https://saved.example.com");
  vi.stubGlobal(
    "WebSocket",
    vi.fn(() => ({
      addEventListener: vi.fn(),
      close: vi.fn(),
    })),
  );

  const cleanup = subscribeAppServerEvents(() => {});

  expect(WebSocket).toHaveBeenCalledWith("wss://saved.example.com/ws");
  cleanup();
});

it("closes the bridge websocket when resetBridgeRealtimeClient is called", () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://bridge.example.com");
  const close = vi.fn();
  vi.stubGlobal(
    "WebSocket",
    vi.fn(() => ({
      addEventListener: vi.fn(),
      close,
    })),
  );

  const cleanup = subscribeAppServerEvents(() => {});
  resetBridgeRealtimeClient();

  expect(close).toHaveBeenCalledTimes(1);
  cleanup();
});
```

Run:

```bash
npm run test -- src/services/events.test.ts
```

Expected: FAIL because reset helpers are not exported.

- [ ] **Step 11: Add realtime close/reset helpers**

Modify `src/services/bridge/realtime.ts`:

```ts
  close() {
    this.socket?.close();
    this.socket = null;
    this.listeners.clear();
  }
```

Modify `src/services/events.ts`:

```ts
export function resetBridgeRealtimeClient() {
  bridgeRealtimeClient?.close();
  bridgeRealtimeClient = null;
  bridgeRealtimeClientUrl = null;
}
```

Update the missing-bridge error in `getBridgeRealtimeClient`:

```ts
throw new Error("Bridge URL is not configured.");
```

- [ ] **Step 12: Run transport tests**

Run:

```bash
npm run test -- src/services/runtime.test.ts src/services/bridge/http.test.ts src/services/tauri.test.ts src/services/events.test.ts
```

Expected: PASS.

- [ ] **Step 13: Commit transport integration**

Run:

```bash
git add src/services/runtime.ts src/services/runtime.test.ts src/services/bridge/http.ts src/services/bridge/http.test.ts src/services/tauri.ts src/services/tauri.test.ts src/services/bridge/realtime.ts src/services/events.ts src/services/events.test.ts
git commit -m "feat: route web bridge through runtime settings"
```

## Task 3: Provider and First-Run Gate

**Files:**

- Create: `src/features/webBridge/WebBridgeProvider.tsx`
- Create: `src/features/webBridge/WebBridgeProvider.test.tsx`
- Create: `src/features/webBridge/WebBridgeGate.tsx`
- Create: `src/features/webBridge/WebBridgeGate.test.tsx`
- Create: `src/features/webBridge/WebBridgeSetupDialog.tsx`
- Create: `src/features/webBridge/index.ts`

- [ ] **Step 1: Write failing provider tests**

Create `src/features/webBridge/WebBridgeProvider.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRuntimeConfig, resetRuntimeBridgeBaseUrlForTests } from "@services/runtime";
import { WebBridgeProvider, useWebBridge } from "./WebBridgeProvider";
import { WEB_BRIDGE_STORAGE_KEY } from "./webBridgeStorage";

describe("WebBridgeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    resetRuntimeBridgeBaseUrlForTests();
  });

  function wrapper(options: {
    testConnection?: (baseUrl: string) => Promise<void>;
    reloadApp?: () => void;
  } = {}) {
    return ({ children }: { children: ReactNode }) => (
      <WebBridgeProvider
        testConnection={options.testConnection ?? vi.fn().mockResolvedValue(undefined)}
        reloadApp={options.reloadApp ?? vi.fn()}
      >
        {children}
      </WebBridgeProvider>
    );
  }

  it("requires setup when web runtime has no saved bridge", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    const { result } = renderHook(() => useWebBridge(), { wrapper: wrapper() });

    expect(result.current.setupRequired).toBe(true);
    expect(result.current.activeBridge).toBeNull();
  });

  it("does not require setup on desktop runtime", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "desktop");

    const { result } = renderHook(() => useWebBridge(), { wrapper: wrapper() });

    expect(result.current.setupRequired).toBe(false);
  });

  it("pre-fills from build-time bridge URL without saving it", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://seed.example.com/");

    const { result } = renderHook(() => useWebBridge(), { wrapper: wrapper() });

    expect(result.current.seedBridgeUrl).toBe("https://seed.example.com");
    expect(localStorage.getItem(WEB_BRIDGE_STORAGE_KEY)).toBeNull();
  });

  it("saves first bridge after a successful test", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    const testConnection = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useWebBridge(), {
      wrapper: wrapper({ testConnection }),
    });

    await act(async () => {
      await result.current.saveFirstBridge({
        name: "dev",
        baseUrl: "https://dev.example.com/",
      });
    });

    expect(testConnection).toHaveBeenCalledWith("https://dev.example.com");
    expect(result.current.setupRequired).toBe(false);
    expect(result.current.activeBridge?.name).toBe("dev");
    expect(readRuntimeConfig().bridgeBaseUrl).toBe("https://dev.example.com");
  });

  it("keeps setup open when the first bridge test fails", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    const testConnection = vi.fn().mockRejectedValue(new Error("no route"));

    const { result } = renderHook(() => useWebBridge(), {
      wrapper: wrapper({ testConnection }),
    });

    await act(async () => {
      await result.current.saveFirstBridge({
        name: "dev",
        baseUrl: "https://dev.example.com",
      });
    });

    expect(result.current.setupRequired).toBe(true);
    expect(result.current.error).toBe("no route");
    expect(result.current.activeBridge).toBeNull();
  });

  it("tests before switching and reloads after success", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    const reloadApp = vi.fn();
    const testConnection = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useWebBridge(), {
      wrapper: wrapper({ testConnection, reloadApp }),
    });

    await act(async () => {
      await result.current.saveFirstBridge({
        name: "dev",
        baseUrl: "https://dev.example.com",
      });
      await result.current.addBridge({
        name: "build",
        baseUrl: "https://build.example.com",
        activate: false,
      });
    });
    const build = result.current.bridges.find((bridge) => bridge.name === "build");
    if (!build) {
      throw new Error("Expected build bridge");
    }

    await act(async () => {
      await result.current.switchBridge(build.id);
    });

    expect(readRuntimeConfig().bridgeBaseUrl).toBe("https://build.example.com");
    expect(reloadApp).toHaveBeenCalledTimes(1);
  });

  it("does not switch or reload when switch test fails", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    const reloadApp = vi.fn();
    const testConnection = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useWebBridge(), {
      wrapper: wrapper({ testConnection, reloadApp }),
    });

    await act(async () => {
      await result.current.saveFirstBridge({
        name: "dev",
        baseUrl: "https://dev.example.com",
      });
      await result.current.addBridge({
        name: "build",
        baseUrl: "https://build.example.com",
        activate: false,
      });
    });
    const build = result.current.bridges.find((bridge) => bridge.name === "build");
    if (!build) {
      throw new Error("Expected build bridge");
    }

    await act(async () => {
      await result.current.switchBridge(build.id);
    });

    expect(result.current.activeBridge?.name).toBe("dev");
    expect(result.current.error).toBe("offline");
    expect(reloadApp).not.toHaveBeenCalled();
  });
});
```

Run:

```bash
npm run test -- src/features/webBridge/WebBridgeProvider.test.tsx
```

Expected: FAIL because the provider does not exist.

- [ ] **Step 2: Add provider implementation**

Create `src/features/webBridge/WebBridgeProvider.tsx` with this public shape:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { testBridgeConnection } from "@services/bridge/http";
import {
  isWebRuntime,
  readRuntimeConfig,
  setRuntimeBridgeBaseUrl,
} from "@services/runtime";
import { resetBridgeRealtimeClient } from "@services/events";
import type { WebBridgeDraft, WebBridgeSettings, WebBridgeTarget } from "./types";
import {
  activateWebBridgeTarget,
  addWebBridgeTarget,
  deleteWebBridgeTarget,
  editWebBridgeTarget,
  getActiveWebBridge,
  loadWebBridgeSettings,
  normalizeWebBridgeUrl,
  saveWebBridgeSettings,
} from "./webBridgeStorage";

type TestConnection = (baseUrl: string) => Promise<void>;

type WebBridgeContextValue = {
  isWeb: boolean;
  setupRequired: boolean;
  seedBridgeUrl: string | null;
  bridges: WebBridgeTarget[];
  activeBridge: WebBridgeTarget | null;
  status: "idle" | "testing" | "switching";
  error: string | null;
  warning: string | null;
  saveFirstBridge: (draft: WebBridgeDraft) => Promise<boolean>;
  addBridge: (draft: WebBridgeDraft & { activate: boolean }) => Promise<boolean>;
  editBridge: (id: string, draft: WebBridgeDraft) => Promise<boolean>;
  switchBridge: (id: string) => Promise<boolean>;
  deleteBridge: (id: string, replacementId?: string) => Promise<boolean>;
  clearError: () => void;
};

const WebBridgeContext = createContext<WebBridgeContextValue | null>(null);

function defaultReloadApp() {
  window.location.reload();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function WebBridgeProvider({
  children,
  testConnection = async (baseUrl) => {
    await testBridgeConnection({ baseUrl });
  },
  reloadApp = defaultReloadApp,
}: {
  children: ReactNode;
  testConnection?: TestConnection;
  reloadApp?: () => void;
}) {
  const isWeb = isWebRuntime();
  const [loaded, setLoaded] = useState(() =>
    loadWebBridgeSettings({
      seedUrl: readRuntimeConfig().bridgeBaseUrl,
      nowMs: Date.now(),
    }),
  );
  const [settings, setSettings] = useState<WebBridgeSettings>(() => ({
    version: 1,
    activeBridgeId: loaded.activeBridgeId,
    bridges: loaded.bridges,
  }));
  const [status, setStatus] = useState<WebBridgeContextValue["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const activeBridge = getActiveWebBridge(settings);

  useEffect(() => {
    if (isWeb) {
      setRuntimeBridgeBaseUrl(activeBridge?.baseUrl ?? null);
    }
  }, [activeBridge?.baseUrl, isWeb]);

  const persist = useCallback((next: WebBridgeSettings) => {
    saveWebBridgeSettings(next);
    setSettings(next);
  }, []);

  const testDraft = useCallback(
    async (draft: WebBridgeDraft) => {
      const normalized = normalizeWebBridgeUrl(draft.baseUrl);
      if (!normalized.ok) {
        setError(normalized.error);
        return null;
      }
      setWarning(normalized.warning);
      await testConnection(normalized.value);
      return normalized.value;
    },
    [testConnection],
  );

  const saveFirstBridge = useCallback(
    async (draft: WebBridgeDraft) => {
      setStatus("testing");
      setError(null);
      try {
        const baseUrl = await testDraft(draft);
        if (!baseUrl) {
          return false;
        }
        const next = addWebBridgeTarget(settings, {
          name: draft.name,
          baseUrl,
          nowMs: Date.now(),
          activate: true,
        });
        persist(next);
        setRuntimeBridgeBaseUrl(baseUrl);
        setLoaded((prev) => ({ ...next, seedBridgeUrl: prev.seedBridgeUrl }));
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      } finally {
        setStatus("idle");
      }
    },
    [persist, settings, testDraft],
  );

  const addBridge = useCallback(
    async (draft: WebBridgeDraft & { activate: boolean }) => {
      setStatus(draft.activate ? "switching" : "testing");
      setError(null);
      try {
        const baseUrl = await testDraft(draft);
        if (!baseUrl) {
          return false;
        }
        const next = addWebBridgeTarget(settings, {
          name: draft.name,
          baseUrl,
          nowMs: Date.now(),
          activate: draft.activate,
        });
        persist(next);
        if (draft.activate) {
          setRuntimeBridgeBaseUrl(baseUrl);
          resetBridgeRealtimeClient();
          reloadApp();
        }
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      } finally {
        setStatus("idle");
      }
    },
    [persist, reloadApp, settings, testDraft],
  );

  const editBridge = useCallback(
    async (id: string, draft: WebBridgeDraft) => {
      const existing = settings.bridges.find((bridge) => bridge.id === id);
      if (!existing) {
        setError("Bridge not found.");
        return false;
      }
      setStatus("testing");
      setError(null);
      try {
        const normalized = normalizeWebBridgeUrl(draft.baseUrl);
        if (!normalized.ok) {
          setError(normalized.error);
          return false;
        }
        setWarning(normalized.warning);
        if (normalized.value !== existing.baseUrl) {
          await testConnection(normalized.value);
        }
        const next = editWebBridgeTarget(settings, id, {
          name: draft.name,
          baseUrl: normalized.value,
          nowMs: Date.now(),
        });
        persist(next);
        if (settings.activeBridgeId === id) {
          setRuntimeBridgeBaseUrl(normalized.value);
          resetBridgeRealtimeClient();
          reloadApp();
        }
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      } finally {
        setStatus("idle");
      }
    },
    [persist, reloadApp, settings, testConnection],
  );

  const switchBridge = useCallback(
    async (id: string) => {
      const target = settings.bridges.find((bridge) => bridge.id === id);
      if (!target || target.id === settings.activeBridgeId) {
        return false;
      }
      setStatus("switching");
      setError(null);
      try {
        await testConnection(target.baseUrl);
        const next = activateWebBridgeTarget(settings, id, Date.now());
        persist(next);
        setRuntimeBridgeBaseUrl(target.baseUrl);
        resetBridgeRealtimeClient();
        reloadApp();
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      } finally {
        setStatus("idle");
      }
    },
    [persist, reloadApp, settings, testConnection],
  );

  const deleteBridge = useCallback(
    async (id: string, replacementId?: string) => {
      const deletingActive = settings.activeBridgeId === id;
      setStatus(deletingActive ? "switching" : "idle");
      setError(null);
      try {
        if (deletingActive) {
          const replacement = settings.bridges.find(
            (bridge) => bridge.id === replacementId || bridge.id !== id,
          );
          if (!replacement) {
            throw new Error("Select another Bridge before deleting this one.");
          }
          await testConnection(replacement.baseUrl);
          const next = deleteWebBridgeTarget(settings, id, replacement.id);
          persist(next);
          setRuntimeBridgeBaseUrl(replacement.baseUrl);
          resetBridgeRealtimeClient();
          reloadApp();
        } else {
          persist(deleteWebBridgeTarget(settings, id));
        }
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      } finally {
        setStatus("idle");
      }
    },
    [persist, reloadApp, settings, testConnection],
  );

  const value = useMemo<WebBridgeContextValue>(
    () => ({
      isWeb,
      setupRequired: isWeb && settings.bridges.length === 0,
      seedBridgeUrl: loaded.seedBridgeUrl,
      bridges: settings.bridges,
      activeBridge,
      status,
      error,
      warning,
      saveFirstBridge,
      addBridge,
      editBridge,
      switchBridge,
      deleteBridge,
      clearError: () => setError(null),
    }),
    [
      activeBridge,
      addBridge,
      deleteBridge,
      editBridge,
      error,
      isWeb,
      loaded.seedBridgeUrl,
      saveFirstBridge,
      settings.bridges,
      status,
      switchBridge,
      warning,
    ],
  );

  return (
    <WebBridgeContext.Provider value={value}>{children}</WebBridgeContext.Provider>
  );
}

export function useWebBridge() {
  const value = useContext(WebBridgeContext);
  if (!value) {
    throw new Error("useWebBridge must be used inside WebBridgeProvider.");
  }
  return value;
}
```

- [ ] **Step 3: Run provider tests**

Run:

```bash
npm run test -- src/features/webBridge/WebBridgeProvider.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Write failing gate tests**

Create `src/features/webBridge/WebBridgeGate.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebBridgeGate } from "./WebBridgeGate";
import { WebBridgeProvider } from "./WebBridgeProvider";
import { addWebBridgeTarget, saveWebBridgeSettings } from "./webBridgeStorage";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("WebBridgeGate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows setup instead of children when web has no bridge", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    render(
      <WebBridgeProvider testConnection={vi.fn().mockResolvedValue(undefined)}>
        <WebBridgeGate>
          <div>App content</div>
        </WebBridgeGate>
      </WebBridgeProvider>,
    );

    expect(screen.getByRole("dialog", { name: "Connect a Bridge" })).toBeTruthy();
    expect(screen.queryByText("App content")).toBeNull();
  });

  it("renders children after a bridge is saved", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    saveWebBridgeSettings(
      addWebBridgeTarget(
        { version: 1, activeBridgeId: null, bridges: [] },
        {
          name: "dev",
          baseUrl: "https://dev.example.com",
          nowMs: 100,
          activate: true,
        },
      ),
    );

    render(
      <WebBridgeProvider testConnection={vi.fn().mockResolvedValue(undefined)}>
        <WebBridgeGate>
          <div>App content</div>
        </WebBridgeGate>
      </WebBridgeProvider>,
    );

    expect(screen.getByText("App content")).toBeTruthy();
  });

  it("renders children on desktop", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "desktop");

    render(
      <WebBridgeProvider testConnection={vi.fn().mockResolvedValue(undefined)}>
        <WebBridgeGate>
          <div>Desktop content</div>
        </WebBridgeGate>
      </WebBridgeProvider>,
    );

    expect(screen.getByText("Desktop content")).toBeTruthy();
  });
});
```

Run:

```bash
npm run test -- src/features/webBridge/WebBridgeGate.test.tsx
```

Expected: FAIL because gate and setup dialog do not exist.

- [ ] **Step 5: Add setup dialog and gate**

Create `src/features/webBridge/WebBridgeSetupDialog.tsx`:

```tsx
import { useState } from "react";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import { useWebBridge } from "./WebBridgeProvider";

export function WebBridgeSetupDialog() {
  const { seedBridgeUrl, saveFirstBridge, status, error, warning } = useWebBridge();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState(seedBridgeUrl ?? "");
  const isBusy = status === "testing";

  return (
    <ModalShell
      className="web-bridge-modal"
      cardClassName="web-bridge-setup-card"
      ariaLabel="Connect a Bridge"
    >
      <form
        className="web-bridge-form"
        onSubmit={(event) => {
          event.preventDefault();
          void saveFirstBridge({ name, baseUrl });
        }}
      >
        <div className="web-bridge-form-header">
          <h2>Connect a Bridge</h2>
          <p>Enter a working Bridge URL before using the app.</p>
        </div>
        <label className="web-bridge-field">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="web-bridge-field">
          <span>Bridge URL</span>
          <input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            autoComplete="url"
            required
          />
        </label>
        {warning ? <div className="web-bridge-warning">{warning}</div> : null}
        {error ? <div className="web-bridge-error">{error}</div> : null}
        <div className="web-bridge-actions">
          <button type="submit" className="primary" disabled={isBusy}>
            {isBusy ? "Testing..." : "Test and Save"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
```

Create `src/features/webBridge/WebBridgeGate.tsx`:

```tsx
import type { ReactNode } from "react";
import { WebBridgeSetupDialog } from "./WebBridgeSetupDialog";
import { useWebBridge } from "./WebBridgeProvider";

export function WebBridgeGate({ children }: { children: ReactNode }) {
  const { setupRequired } = useWebBridge();
  if (setupRequired) {
    return <WebBridgeSetupDialog />;
  }
  return <>{children}</>;
}
```

Create `src/features/webBridge/index.ts`:

```ts
export { WebBridgeGate } from "./WebBridgeGate";
export { WebBridgeProvider, useWebBridge } from "./WebBridgeProvider";
export { WebBridgeSwitcher } from "./WebBridgeSwitcher";
```

`WebBridgeSwitcher` will be created in Task 4. TypeScript will fail until Task 4 creates that file; for this task, either export only provider/gate now or create a temporary `WebBridgeSwitcher.tsx` that returns `null`:

```tsx
export function WebBridgeSwitcher() {
  return null;
}
```

- [ ] **Step 6: Run provider and gate tests**

Run:

```bash
npm run test -- src/features/webBridge/WebBridgeProvider.test.tsx src/features/webBridge/WebBridgeGate.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit provider and gate**

Run:

```bash
git add src/features/webBridge/WebBridgeProvider.tsx src/features/webBridge/WebBridgeProvider.test.tsx src/features/webBridge/WebBridgeGate.tsx src/features/webBridge/WebBridgeGate.test.tsx src/features/webBridge/WebBridgeSetupDialog.tsx src/features/webBridge/index.ts src/features/webBridge/WebBridgeSwitcher.tsx
git commit -m "feat: add web bridge setup gate"
```

## Task 4: Switcher, Picker, Manager, and Mobile Sheet

**Files:**

- Create or replace: `src/features/webBridge/WebBridgeSwitcher.tsx`
- Create: `src/features/webBridge/WebBridgePicker.tsx`
- Create: `src/features/webBridge/WebBridgeManager.tsx`
- Create: `src/features/webBridge/WebBridgeSwitcher.test.tsx`
- Create: `src/styles/web-bridge.css`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing switcher tests**

Create `src/features/webBridge/WebBridgeSwitcher.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebBridgeProvider } from "./WebBridgeProvider";
import { WebBridgeSwitcher } from "./WebBridgeSwitcher";
import { addWebBridgeTarget, saveWebBridgeSettings } from "./webBridgeStorage";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function seedTwoBridges() {
  const first = addWebBridgeTarget(
    { version: 1, activeBridgeId: null, bridges: [] },
    {
      name: "dev",
      baseUrl: "https://dev.example.com",
      nowMs: 100,
      activate: true,
    },
  );
  const second = addWebBridgeTarget(first, {
    name: "build",
    baseUrl: "https://build.example.com",
    nowMs: 200,
    activate: false,
  });
  saveWebBridgeSettings(second);
}

function renderSwitcher(options: {
  testConnection?: (baseUrl: string) => Promise<void>;
  reloadApp?: () => void;
  children?: ReactNode;
} = {}) {
  return render(
    <WebBridgeProvider
      testConnection={options.testConnection ?? vi.fn().mockResolvedValue(undefined)}
      reloadApp={options.reloadApp ?? vi.fn()}
    >
      {options.children ?? <WebBridgeSwitcher />}
    </WebBridgeProvider>,
  );
}

describe("WebBridgeSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  });

  it("shows the active bridge in the top control", () => {
    seedTwoBridges();

    renderSwitcher();

    expect(screen.getByRole("button", { name: /Current Bridge: dev/ })).toBeTruthy();
  });

  it("switches after a successful test", async () => {
    seedTwoBridges();
    const reloadApp = vi.fn();
    const testConnection = vi.fn().mockResolvedValue(undefined);

    renderSwitcher({ testConnection, reloadApp });
    fireEvent.click(screen.getByRole("button", { name: /Current Bridge: dev/ }));
    fireEvent.click(screen.getByRole("button", { name: /build/ }));

    await waitFor(() => {
      expect(testConnection).toHaveBeenCalledWith("https://build.example.com");
      expect(reloadApp).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the old bridge visible when switch test fails", async () => {
    seedTwoBridges();
    const reloadApp = vi.fn();
    const testConnection = vi.fn().mockRejectedValue(new Error("offline"));

    renderSwitcher({ testConnection, reloadApp });
    fireEvent.click(screen.getByRole("button", { name: /Current Bridge: dev/ }));
    fireEvent.click(screen.getByRole("button", { name: /build/ }));

    expect(await screen.findByText("offline")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Current Bridge: dev/ })).toBeTruthy();
    expect(reloadApp).not.toHaveBeenCalled();
  });

  it("adds a bridge through the manager only after test succeeds", async () => {
    seedTwoBridges();
    const testConnection = vi.fn().mockResolvedValue(undefined);

    renderSwitcher({ testConnection });
    fireEvent.click(screen.getByRole("button", { name: /Current Bridge: dev/ }));
    fireEvent.click(screen.getByRole("button", { name: "Manage Bridges" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Bridge" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "prod" },
    });
    fireEvent.change(screen.getByLabelText("Bridge URL"), {
      target: { value: "https://prod.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test and Save" }));

    expect(await screen.findByText("prod")).toBeTruthy();
    expect(testConnection).toHaveBeenCalledWith("https://prod.example.com");
  });

  it("renders mobile picker as a bottom sheet", () => {
    seedTwoBridges();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { container } = renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: /Current Bridge: dev/ }));

    expect(container.querySelector(".web-bridge-sheet")).toBeTruthy();
  });
});
```

Run:

```bash
npm run test -- src/features/webBridge/WebBridgeSwitcher.test.tsx
```

Expected: FAIL because switcher UI is missing.

- [ ] **Step 2: Add picker component**

Create `src/features/webBridge/WebBridgePicker.tsx`:

```tsx
import type { WebBridgeTarget } from "./types";

type WebBridgePickerProps = {
  bridges: WebBridgeTarget[];
  activeBridgeId: string | null;
  status: "idle" | "testing" | "switching";
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onManage: () => void;
};

export function WebBridgePicker({
  bridges,
  activeBridgeId,
  status,
  onSwitch,
  onAdd,
  onManage,
}: WebBridgePickerProps) {
  return (
    <div className="web-bridge-picker">
      <div className="web-bridge-picker-title">Select Bridge</div>
      <div className="web-bridge-picker-list">
        {bridges.map((bridge) => {
          const active = bridge.id === activeBridgeId;
          return (
            <button
              key={bridge.id}
              type="button"
              className={`web-bridge-row${active ? " is-active" : ""}`}
              onClick={() => onSwitch(bridge.id)}
              disabled={active || status !== "idle"}
            >
              <span className="web-bridge-row-marker">{active ? "*" : ""}</span>
              <span className="web-bridge-row-main">
                <span className="web-bridge-row-name">{bridge.name}</span>
                <span className="web-bridge-row-url">{bridge.baseUrl}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="web-bridge-picker-actions">
        <button type="button" onClick={onAdd}>
          Add Bridge
        </button>
        <button type="button" onClick={onManage}>
          Manage Bridges
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add manager component**

Create `src/features/webBridge/WebBridgeManager.tsx`:

```tsx
import { useState } from "react";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import type { WebBridgeTarget } from "./types";

type ManagerMode =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "edit"; bridge: WebBridgeTarget };

type WebBridgeManagerProps = {
  bridges: WebBridgeTarget[];
  activeBridgeId: string | null;
  status: "idle" | "testing" | "switching";
  error: string | null;
  warning: string | null;
  onClose: () => void;
  onAdd: (draft: { name: string; baseUrl: string; activate: boolean }) => Promise<boolean>;
  onEdit: (id: string, draft: { name: string; baseUrl: string }) => Promise<boolean>;
  onDelete: (id: string, replacementId?: string) => Promise<boolean>;
};

export function WebBridgeManager({
  bridges,
  activeBridgeId,
  status,
  error,
  warning,
  onClose,
  onAdd,
  onEdit,
  onDelete,
}: WebBridgeManagerProps) {
  const [mode, setMode] = useState<ManagerMode>({ kind: "list" });
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const isBusy = status !== "idle";

  const startAdd = () => {
    setName("");
    setBaseUrl("");
    setMode({ kind: "add" });
  };

  const startEdit = (bridge: WebBridgeTarget) => {
    setName(bridge.name);
    setBaseUrl(bridge.baseUrl);
    setMode({ kind: "edit", bridge });
  };

  const submit = async () => {
    if (mode.kind === "add") {
      if (await onAdd({ name, baseUrl, activate: false })) {
        setMode({ kind: "list" });
      }
      return;
    }
    if (mode.kind === "edit") {
      if (await onEdit(mode.bridge.id, { name, baseUrl })) {
        setMode({ kind: "list" });
      }
    }
  };

  return (
    <ModalShell
      className="web-bridge-modal"
      cardClassName="web-bridge-manager-card"
      ariaLabel="Manage Bridges"
      onBackdropClick={onClose}
    >
      {mode.kind === "list" ? (
        <div className="web-bridge-manager">
          <div className="web-bridge-form-header">
            <h2>Bridge Management</h2>
            <p>These entries are saved in this browser.</p>
          </div>
          <div className="web-bridge-manager-list">
            {bridges.map((bridge) => (
              <div key={bridge.id} className="web-bridge-manager-row">
                <div>
                  <strong>{bridge.name}</strong>
                  {bridge.id === activeBridgeId ? <em>Active</em> : null}
                  <span>{bridge.baseUrl}</span>
                </div>
                <div className="web-bridge-manager-row-actions">
                  <button type="button" onClick={() => startEdit(bridge)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(bridge.id)}
                    disabled={bridges.length <= 1 || isBusy}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          {error ? <div className="web-bridge-error">{error}</div> : null}
          <div className="web-bridge-actions">
            <button type="button" onClick={startAdd}>
              Add Bridge
            </button>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <form
          className="web-bridge-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="web-bridge-form-header">
            <h2>{mode.kind === "add" ? "Add Bridge" : "Edit Bridge"}</h2>
          </div>
          <label className="web-bridge-field">
            <span>Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="web-bridge-field">
            <span>Bridge URL</span>
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              autoComplete="url"
              required
            />
          </label>
          {warning ? <div className="web-bridge-warning">{warning}</div> : null}
          {error ? <div className="web-bridge-error">{error}</div> : null}
          <div className="web-bridge-actions">
            <button type="button" onClick={() => setMode({ kind: "list" })}>
              Back
            </button>
            <button type="submit" className="primary" disabled={isBusy}>
              {isBusy ? "Testing..." : "Test and Save"}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}
```

- [ ] **Step 4: Add switcher component**

Replace `src/features/webBridge/WebBridgeSwitcher.tsx`:

```tsx
import { useEffect, useState } from "react";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import { PopoverSurface } from "@/features/design-system/components/popover/PopoverPrimitives";
import { useMenuController } from "@app/hooks/useMenuController";
import { useWebBridge } from "./WebBridgeProvider";
import { WebBridgeManager } from "./WebBridgeManager";
import { WebBridgePicker } from "./WebBridgePicker";

function useMobileBridgePicker() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 700px)").matches
      : false,
  );

  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return mobile;
}

export function WebBridgeSwitcher() {
  const {
    isWeb,
    activeBridge,
    bridges,
    status,
    error,
    warning,
    switchBridge,
    addBridge,
    editBridge,
    deleteBridge,
    clearError,
  } = useWebBridge();
  const menu = useMenuController({ onDismiss: clearError });
  const mobile = useMobileBridgePicker();
  const [managerOpen, setManagerOpen] = useState(false);

  if (!isWeb || !activeBridge) {
    return null;
  }

  const picker = (
    <WebBridgePicker
      bridges={bridges}
      activeBridgeId={activeBridge.id}
      status={status}
      onSwitch={(id) => void switchBridge(id)}
      onAdd={() => {
        setManagerOpen(true);
        menu.setOpen(false);
      }}
      onManage={() => {
        setManagerOpen(true);
        menu.setOpen(false);
      }}
    />
  );

  return (
    <div className="web-bridge-switcher" ref={menu.containerRef}>
      <button
        type="button"
        className="web-bridge-trigger"
        onClick={menu.toggle}
        aria-label={`Current Bridge: ${activeBridge.name}`}
        aria-expanded={menu.isOpen}
      >
        <span>{activeBridge.name}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {menu.isOpen && mobile ? (
        <div className="web-bridge-sheet" role="dialog" aria-label="Select Bridge">
          <button
            type="button"
            className="web-bridge-sheet-backdrop"
            aria-label="Close Bridge picker"
            onClick={() => menu.setOpen(false)}
          />
          <div className="web-bridge-sheet-card">{picker}</div>
        </div>
      ) : null}
      {menu.isOpen && !mobile ? (
        <PopoverSurface className="web-bridge-popover" role="dialog">
          {picker}
          {error ? <div className="web-bridge-error">{error}</div> : null}
        </PopoverSurface>
      ) : null}
      {managerOpen ? (
        <WebBridgeManager
          bridges={bridges}
          activeBridgeId={activeBridge.id}
          status={status}
          error={error}
          warning={warning}
          onClose={() => setManagerOpen(false)}
          onAdd={addBridge}
          onEdit={editBridge}
          onDelete={deleteBridge}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Add feature CSS and import it**

Create `src/styles/web-bridge.css`:

```css
.web-bridge-chrome {
  position: fixed;
  top: max(10px, env(safe-area-inset-top));
  right: 12px;
  z-index: 35;
}

.web-bridge-trigger {
  border: 1px solid var(--ds-border-subtle);
  background: var(--ds-surface-muted);
  color: var(--ds-text-strong);
  border-radius: 8px;
  padding: 6px 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: min(280px, calc(100vw - 24px));
}

.web-bridge-trigger span,
.web-bridge-row-name,
.web-bridge-row-url {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.web-bridge-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 320px;
  padding: 10px;
}

.web-bridge-picker-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ds-text-strong);
  margin-bottom: 8px;
}

.web-bridge-picker-list {
  display: grid;
  gap: 4px;
}

.web-bridge-row {
  border: 0;
  width: 100%;
  border-radius: 8px;
  background: transparent;
  color: var(--ds-text-muted);
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 8px;
  padding: 8px;
  text-align: left;
}

.web-bridge-row:hover:not(:disabled),
.web-bridge-row:focus-visible,
.web-bridge-row.is-active {
  background: var(--surface-hover);
  color: var(--ds-text-strong);
}

.web-bridge-row-main {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.web-bridge-row-url {
  font-size: 11px;
  color: var(--ds-text-faint);
}

.web-bridge-picker-actions,
.web-bridge-actions,
.web-bridge-manager-row-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.web-bridge-picker-actions {
  margin-top: 10px;
}

.web-bridge-modal .ds-modal-card {
  border-radius: 8px;
}

.web-bridge-setup-card,
.web-bridge-manager-card {
  width: min(420px, calc(100vw - 24px));
  padding: 18px;
}

.web-bridge-form,
.web-bridge-manager {
  display: grid;
  gap: 12px;
}

.web-bridge-form-header h2 {
  margin: 0;
  font-size: 18px;
}

.web-bridge-form-header p {
  margin: 4px 0 0;
  color: var(--ds-text-subtle);
  font-size: 13px;
}

.web-bridge-field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--ds-text-subtle);
}

.web-bridge-field input {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--ds-border-subtle);
  background: var(--ds-surface-muted);
  color: var(--ds-text-strong);
  padding: 9px 10px;
}

.web-bridge-error,
.web-bridge-warning {
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
}

.web-bridge-error {
  color: #ff8f8f;
  background: rgba(255, 79, 79, 0.12);
  border: 1px solid rgba(255, 79, 79, 0.4);
}

.web-bridge-warning {
  color: #ffd27a;
  background: rgba(255, 192, 79, 0.12);
  border: 1px solid rgba(255, 192, 79, 0.4);
}

.web-bridge-manager-list {
  display: grid;
  gap: 8px;
}

.web-bridge-manager-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 1px solid var(--ds-border-subtle);
  border-radius: 8px;
  padding: 10px;
}

.web-bridge-manager-row div:first-child {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.web-bridge-manager-row span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ds-text-faint);
  font-size: 12px;
}

.web-bridge-sheet {
  position: fixed;
  inset: 0;
  z-index: 45;
}

.web-bridge-sheet-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.45);
}

.web-bridge-sheet-card {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 8px 8px 0 0;
  border: 1px solid var(--ds-border-subtle);
  background: var(--ds-modal-card-bg);
  color: var(--ds-text-strong);
  padding: 14px;
  max-height: min(70vh, 520px);
  overflow: auto;
}

@media (max-width: 700px) {
  .web-bridge-chrome {
    left: 10px;
    right: 10px;
  }

  .web-bridge-switcher,
  .web-bridge-trigger {
    width: 100%;
  }

  .web-bridge-trigger {
    justify-content: space-between;
  }
}
```

Modify `src/App.tsx` imports:

```ts
import "./styles/web-bridge.css";
```

- [ ] **Step 6: Run switcher tests**

Run:

```bash
npm run test -- src/features/webBridge/WebBridgeSwitcher.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit switcher UI**

Run:

```bash
git add src/features/webBridge/WebBridgeSwitcher.tsx src/features/webBridge/WebBridgePicker.tsx src/features/webBridge/WebBridgeManager.tsx src/features/webBridge/WebBridgeSwitcher.test.tsx src/styles/web-bridge.css src/App.tsx
git commit -m "feat: add web bridge switcher UI"
```

## Task 5: App Wiring and Shell Placement

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/features/app/components/MainAppShell.tsx`
- Modify: `src/features/app/components/MainAppShell.test.tsx`
- Modify: `src/features/webBridge/index.ts`

- [ ] **Step 1: Write failing app shell tests**

Modify `src/features/app/components/MainAppShell.test.tsx` mocks:

```ts
vi.mock("@/features/webBridge", () => ({
  WebBridgeSwitcher: () => <div data-testid="web-bridge-switcher" />,
}));
```

Add tests:

```tsx
it("renders the web bridge switcher in web runtime", () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

  render(<MainAppShell {...buildProps()} />);

  expect(screen.getByTestId("web-bridge-switcher")).toBeTruthy();
});

it("does not render the web bridge switcher on desktop", () => {
  render(<MainAppShell {...buildProps()} />);

  expect(screen.queryByTestId("web-bridge-switcher")).toBeNull();
});
```

Run:

```bash
npm run test -- src/features/app/components/MainAppShell.test.tsx
```

Expected: FAIL because `MainAppShell` does not render the switcher.

- [ ] **Step 2: Render switcher in app shell**

Modify `src/features/app/components/MainAppShell.tsx` imports:

```ts
import { WebBridgeSwitcher } from "@/features/webBridge";
```

Render after desktop chrome and before lazy data:

```tsx
{webRuntime ? (
  <div className="web-bridge-chrome">
    <WebBridgeSwitcher />
  </div>
) : null}
```

- [ ] **Step 3: Run app shell tests**

Run:

```bash
npm run test -- src/features/app/components/MainAppShell.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Write failing App gate test**

Create a new test in `src/App.test.tsx` if the file does not exist:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/layout/hooks/useWindowLabel", () => ({
  useWindowLabel: () => "main",
}));

vi.mock("@app/components/MainApp", () => ({
  default: () => <div>Main app mounted</div>,
}));

describe("App web bridge gate", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("blocks MainApp behind bridge setup on first web visit", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    const { default: App } = await import("./App");

    render(<App />);

    expect(screen.getByRole("dialog", { name: "Connect a Bridge" })).toBeTruthy();
    expect(screen.queryByText("Main app mounted")).toBeNull();
  });

  it("mounts MainApp on desktop without bridge setup", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "desktop");
    const { default: App } = await import("./App");

    render(<App />);

    expect(screen.getByText("Main app mounted")).toBeTruthy();
  });
});
```

Run:

```bash
npm run test -- src/App.test.tsx
```

Expected: FAIL because `App` does not wrap `MainApp` with provider/gate.

- [ ] **Step 5: Wrap MainApp with provider/gate**

Modify `src/App.tsx`:

```tsx
import { WebBridgeGate, WebBridgeProvider } from "@/features/webBridge";
```

Replace the final `return <MainApp />;` with:

```tsx
return (
  <WebBridgeProvider>
    <WebBridgeGate>
      <MainApp />
    </WebBridgeGate>
  </WebBridgeProvider>
);
```

Keep the about window path unchanged so `AboutView` still renders outside the main app gate.

- [ ] **Step 6: Run app and shell tests**

Run:

```bash
npm run test -- src/App.test.tsx src/features/app/components/MainAppShell.test.tsx src/features/webBridge/WebBridgeGate.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit app wiring**

Run:

```bash
git add src/App.tsx src/App.test.tsx src/features/app/components/MainAppShell.tsx src/features/app/components/MainAppShell.test.tsx src/features/webBridge/index.ts
git commit -m "feat: wire web bridge management into app shell"
```

## Task 6: Verification and Manual Browser Check

**Files:**

- No source files unless verification finds a defect.

- [ ] **Step 1: Run focused feature tests**

Run:

```bash
npm run test -- src/features/webBridge/webBridgeStorage.test.ts src/features/webBridge/WebBridgeProvider.test.tsx src/features/webBridge/WebBridgeGate.test.tsx src/features/webBridge/WebBridgeSwitcher.test.tsx src/services/runtime.test.ts src/services/bridge/http.test.ts src/services/tauri.test.ts src/services/events.test.ts src/App.test.tsx src/features/app/components/MainAppShell.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full frontend checks**

Run:

```bash
npm run typecheck
npm run test
npm run build:web
```

Expected:

- `npm run typecheck`: exits 0.
- `npm run test`: all test files pass.
- `npm run build:web`: exits 0 and writes `dist/`.

- [ ] **Step 3: Start local validation servers**

Use the existing bridge/daemon flow. If the daemon is already running, reuse it. Start the web build with web runtime:

```bash
VITE_CODEXMONITOR_RUNTIME=web npm run dev -- --host 127.0.0.1 --port 1426
```

If port `1426` is busy, use `1427`.

Expected: Vite prints a local URL such as `http://127.0.0.1:1426/`.

- [ ] **Step 4: Manually validate desktop viewport**

In a clean browser context:

1. Open the local web URL.
2. Confirm first visit shows `Connect a Bridge`.
3. Enter a bad URL such as `https://127.0.0.1:1` and confirm it cannot be saved.
4. Enter the working bridge URL and confirm the normal UI loads.
5. Confirm the top bridge switcher shows the active bridge name.
6. Add a second bridge entry through management.
7. Switch to a working second bridge and confirm the app reloads.
8. Switch to a bad bridge and confirm the old bridge remains selected.

Expected: No white screen. Failed tests/switches show visible errors.

- [ ] **Step 5: Manually validate mobile viewport**

Use Playwright or browser devtools at a mobile width:

```bash
npx playwright test --help >/dev/null
```

If Playwright is available, use a small script or interactive browser to set viewport `390x844`. If it is not available, use the browser devtools responsive toolbar.

Expected:

- the bridge trigger spans the top width without text overflow
- tapping the trigger opens a bottom sheet
- selecting another bridge starts the same test-before-switch flow
- closing the sheet returns to the current page

- [ ] **Step 6: Record final git state**

Run:

```bash
git status --short --branch
git log --oneline --decorate -6
```

Expected:

- branch is `codex/web-bridge-url-management`
- only intended feature files are committed
- worktree is clean

Do not merge or push until the user has inspected the running UI or explicitly asks for merge/push.
