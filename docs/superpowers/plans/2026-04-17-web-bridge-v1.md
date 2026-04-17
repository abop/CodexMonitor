# Web Bridge V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Cloudflare-hosted web build of CodexMonitor that reuses the existing React UI, talks to a new server-side web bridge, and uses the existing daemon for single-user remote workspace workflows.

**Architecture:** Keep one frontend UI and make its service layer runtime-aware. Desktop builds continue to use the current Tauri-backed calls; web builds switch to a bridge RPC client plus a bridge realtime client. Add a new Rust `codex_monitor_web_bridge` binary that exposes an allowlisted `/api/rpc` endpoint and a `/ws` event stream, then forwards requests and daemon notifications over the existing line-based TCP protocol.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, Rust, Tokio, Axum, WebSocket, existing daemon TCP protocol, Cloudflare-hosted frontend.

---

### Task 1: Add frontend runtime and bridge transport primitives

**Files:**
- Create: `src/services/runtime.ts`
- Create: `src/services/bridge/http.ts`
- Create: `src/services/bridge/realtime.ts`
- Test: `src/services/bridge/http.test.ts`
- Test: `src/services/events.test.ts`

- [ ] **Step 1: Write the failing bridge transport tests**

```ts
// src/services/bridge/http.test.ts
import { describe, expect, it, vi } from "vitest";
import { bridgeRpc } from "./http";

describe("bridgeRpc", () => {
  it("posts method and params to /api/rpc", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: [{ id: "ws-1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await bridgeRpc<{ id: string }[]>(
      { baseUrl: "https://bridge.example.com" },
      "list_workspaces",
      { workspaceId: "ignored" },
    );

    expect(result).toEqual([{ id: "ws-1" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bridge.example.com/api/rpc",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("throws the bridge error message when the server returns an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "bridge denied method" } }),
      }),
    );

    await expect(
      bridgeRpc({ baseUrl: "https://bridge.example.com" }, "bad_method", {}),
    ).rejects.toThrow("bridge denied method");
  });
});
```

Run: `npm run test -- src/services/bridge/http.test.ts src/services/events.test.ts`  
Expected: FAIL because `src/services/bridge/http.ts` and `src/services/bridge/realtime.ts` do not exist yet.

- [ ] **Step 2: Create runtime detection and bridge RPC helpers**

```ts
// src/services/runtime.ts
export type AppRuntime = "desktop" | "web";

export type RuntimeConfig = {
  runtime: AppRuntime;
  bridgeBaseUrl: string | null;
};

export function resolveAppRuntime(options: {
  runtimeEnv?: string;
  hasTauri?: boolean;
}): AppRuntime {
  if (options.runtimeEnv === "web") {
    return "web";
  }
  return options.hasTauri ? "desktop" : "web";
}

export function readRuntimeConfig(): RuntimeConfig {
  const hasTauri =
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window;
  const runtime = resolveAppRuntime({
    runtimeEnv: import.meta.env.VITE_CODEXMONITOR_RUNTIME,
    hasTauri,
  });
  const bridgeBaseUrl = import.meta.env.VITE_CODEXMONITOR_BRIDGE_URL ?? null;
  return { runtime, bridgeBaseUrl };
}

export function isWebRuntime() {
  return readRuntimeConfig().runtime === "web";
}
```

```ts
// src/services/bridge/http.ts
type BridgeConfig = {
  baseUrl: string;
};

export async function bridgeRpc<T>(
  config: BridgeConfig,
  method: string,
  params: Record<string, unknown> | undefined,
): Promise<T> {
  const response = await fetch(`${config.baseUrl}/api/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ method, params: params ?? {} }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error?.message) {
    throw new Error(payload?.error?.message ?? `Bridge request failed (${response.status})`);
  }

  return payload.result as T;
}
```

- [ ] **Step 3: Create the bridge realtime singleton**

```ts
// src/services/bridge/realtime.ts
type BridgeNotification = {
  method: string;
  params: unknown;
};

type Listener = (payload: unknown) => void;

export class BridgeRealtimeClient {
  private socket: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();

  constructor(private readonly url: string) {}

  subscribe(method: string, listener: Listener) {
    if (!this.socket) {
      this.socket = new WebSocket(this.url);
      this.socket.addEventListener("message", (event) => {
        const payload = JSON.parse(String(event.data)) as BridgeNotification;
        const listeners = this.listeners.get(payload.method);
        listeners?.forEach((entry) => entry(payload.params));
      });
    }

    const existing = this.listeners.get(method) ?? new Set<Listener>();
    existing.add(listener);
    this.listeners.set(method, existing);

    return () => {
      const next = this.listeners.get(method);
      next?.delete(listener);
      if (next && next.size === 0) {
        this.listeners.delete(method);
      }
      if (this.listeners.size === 0) {
        this.socket?.close();
        this.socket = null;
      }
    };
  }
}
```

- [ ] **Step 4: Run the focused transport tests**

Run: `npm run test -- src/services/bridge/http.test.ts src/services/events.test.ts`  
Expected: PASS for the new bridge helper test and current event tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/services/runtime.ts src/services/bridge/http.ts src/services/bridge/realtime.ts src/services/bridge/http.test.ts src/services/events.test.ts
git commit -m "feat: add web runtime bridge primitives"
```

### Task 2: Route frontend service calls through bridge RPC and websocket

**Files:**
- Modify: `src/services/tauri.ts`
- Modify: `src/services/events.ts`
- Test: `src/services/tauri.test.ts`
- Test: `src/services/events.test.ts`

- [ ] **Step 1: Add failing tests for web-runtime service routing**

```ts
// src/services/tauri.test.ts
it("routes listWorkspaces through bridgeRpc in web runtime", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://bridge.example.com");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: [{ id: "ws-1", path: "/srv/app", connected: true, settings: {} }] }),
    }),
  );

  await expect(listWorkspaces()).resolves.toHaveLength(1);
  expect(fetch).toHaveBeenCalledWith(
    "https://bridge.example.com/api/rpc",
    expect.objectContaining({
      body: JSON.stringify({ method: "list_workspaces", params: {} }),
    }),
  );
});

it("routes sendUserMessage through bridgeRpc in web runtime", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://bridge.example.com");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { ok: true } }),
    }),
  );

  await sendUserMessage("ws-1", "thread-1", "hello", {
    images: ["data:image/png;base64,AAAA"],
  });

  expect(fetch).toHaveBeenCalledWith(
    "https://bridge.example.com/api/rpc",
    expect.objectContaining({
      body: JSON.stringify({
        method: "send_user_message",
        params: {
          workspaceId: "ws-1",
          threadId: "thread-1",
          text: "hello",
          model: null,
          effort: null,
          accessMode: null,
          images: ["data:image/png;base64,AAAA"],
        },
      }),
    }),
  );
});
```

```ts
// src/services/events.test.ts
it("subscribes to bridge websocket app-server events in web runtime", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://bridge.example.com");
  const addEventListener = vi.fn();
  const close = vi.fn();
  vi.stubGlobal("WebSocket", vi.fn(() => ({ addEventListener, close })));

  const cleanup = subscribeAppServerEvents(() => {});

  expect(WebSocket).toHaveBeenCalledWith("wss://bridge.example.com/ws");
  cleanup();
});
```

Run: `npm run test -- src/services/tauri.test.ts src/services/events.test.ts`  
Expected: FAIL because `tauri.ts` and `events.ts` still call Tauri-only paths in all runtimes.

- [ ] **Step 2: Add bridge-backed helpers for the supported V1 method set**

```ts
// src/services/tauri.ts
import { bridgeRpc } from "./bridge/http";
import { isWebRuntime, readRuntimeConfig } from "./runtime";

function bridgeConfigOrThrow() {
  const config = readRuntimeConfig();
  if (!config.bridgeBaseUrl) {
    throw new Error("Missing VITE_CODEXMONITOR_BRIDGE_URL for web runtime.");
  }
  return { baseUrl: config.bridgeBaseUrl };
}

function unsupportedInWeb(feature: string): never {
  throw new Error(`${feature} is unavailable in the web build.`);
}

async function bridgeInvoke<T>(method: string, params?: Record<string, unknown>) {
  return bridgeRpc<T>(bridgeConfigOrThrow(), method, params);
}

export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  if (isWebRuntime()) {
    return bridgeInvoke<WorkspaceInfo[]>("list_workspaces", {});
  }
  try {
    return await invoke<WorkspaceInfo[]>("list_workspaces");
  } catch (error) {
    if (isMissingTauriInvokeError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getModelList(workspaceId: string) {
  if (isWebRuntime()) {
    return bridgeInvoke<any>("model_list", { workspaceId });
  }
  return invoke<any>("model_list", { workspaceId });
}
```

Extend this pattern to the full V1 allowlist:

```ts
const WEB_SUPPORTED_RPC_METHODS = new Set([
  "list_workspaces",
  "add_workspace",
  "connect_workspace",
  "list_threads",
  "start_thread",
  "read_thread",
  "resume_thread",
  "set_thread_name",
  "archive_thread",
  "send_user_message",
  "turn_interrupt",
  "thread_live_subscribe",
  "thread_live_unsubscribe",
  "get_git_status",
  "get_git_diffs",
  "get_git_log",
  "list_git_branches",
  "get_git_commit_diff",
  "get_git_remote",
  "get_app_settings",
  "update_app_settings",
  "get_config_model",
  "model_list",
  "collaboration_mode_list",
  "skills_list",
  "apps_list",
  "prompts_list",
  "account_rate_limits",
  "account_read",
]);
```

Unsupported web-only calls should explicitly fail with `unsupportedInWeb(...)` instead of touching Tauri plugins.

- [ ] **Step 3: Route event subscriptions through the bridge websocket client**

```ts
// src/services/events.ts
import { BridgeRealtimeClient } from "./bridge/realtime";
import { isWebRuntime, readRuntimeConfig } from "./runtime";

function getBridgeRealtimeClient() {
  const config = readRuntimeConfig();
  if (!config.bridgeBaseUrl) {
    throw new Error("Missing VITE_CODEXMONITOR_BRIDGE_URL for web runtime.");
  }
  const wsUrl = config.bridgeBaseUrl.replace(/^http/, "ws");
  return new BridgeRealtimeClient(`${wsUrl}/ws`);
}

function createEventHub<T>(eventName: string) {
  const listeners = new Set<Listener<T>>();
  let cleanup: Unsubscribe | null = null;

  const start = (options?: SubscriptionOptions) => {
    if (cleanup) {
      return;
    }

    if (isWebRuntime()) {
      if (eventName !== "app-server-event") {
        cleanup = () => {};
        return;
      }
      cleanup = getBridgeRealtimeClient().subscribe(eventName, (payload) => {
        listeners.forEach((listener) => listener(payload as T));
      });
      return;
    }

    listenPromise = listen<T>(eventName, (event) => {
      listeners.forEach((listener) => listener(event.payload));
    });
  };
```

Keep all menu-only desktop events as safe no-ops in the web build.

- [ ] **Step 4: Run the frontend service tests**

Run: `npm run test -- src/services/tauri.test.ts src/services/events.test.ts`  
Expected: PASS, including the new web-runtime assertions.

- [ ] **Step 5: Commit**

```bash
git add src/services/tauri.ts src/services/events.ts src/services/tauri.test.ts src/services/events.test.ts
git commit -m "feat: route web runtime services through bridge transport"
```

### Task 3: Support browser-local images and server-path workspace entry in web runtime

**Files:**
- Create: `src/services/browserFiles.ts`
- Modify: `src/services/tauri.ts`
- Modify: `src/features/composer/hooks/useComposerImages.ts`
- Modify: `src/features/composer/hooks/useComposerImageDrop.ts`
- Modify: `src/features/app/hooks/useWorkspaceDialogs.ts`
- Modify: `src/features/app/hooks/useWorkspaceController.ts`
- Test: `src/features/composer/hooks/useComposerImages.test.ts`
- Test: `src/features/composer/hooks/useComposerImageDrop.test.ts`
- Test: `src/features/app/hooks/useWorkspaceController.test.tsx`

- [ ] **Step 1: Write the failing browser-input tests**

```ts
// src/features/composer/hooks/useComposerImages.test.ts
it("uses browser file input images in web runtime", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  const pickImageFiles = vi.fn().mockResolvedValue(["data:image/png;base64,AAAA"]);
  vi.doMock("../../../services/tauri", () => ({ pickImageFiles }));

  const hook = renderComposerImages({
    activeThreadId: "thread-1",
    activeWorkspaceId: "ws-1",
  });

  await act(async () => {
    await hook.result.pickImages();
  });

  expect(hook.result.activeImages).toEqual(["data:image/png;base64,AAAA"]);
  hook.unmount();
});
```

```ts
// src/features/composer/hooks/useComposerImageDrop.test.ts
it("ignores drag attach when the runtime is web", () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  const onAttachImages = vi.fn();
  const hook = renderImageDropHook({ disabled: false, onAttachImages });

  act(() => {
    hook.result.handleDragOver(createDragEvent(["Files"]));
  });

  expect(hook.result.isDragOver).toBe(false);
});
```

```ts
// src/features/app/hooks/useWorkspaceController.test.tsx
it("opens the remote path prompt in web runtime", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

  const { result } = renderWorkspaceController({
    appSettings: { ...baseSettings, backendMode: "local" },
  });

  await act(async () => {
    await result.current.addWorkspace();
  });

  expect(result.current.mobileRemoteWorkspacePathPrompt).not.toBeNull();
});
```

Run: `npm run test -- src/features/composer/hooks/useComposerImages.test.ts src/features/composer/hooks/useComposerImageDrop.test.ts src/features/app/hooks/useWorkspaceController.test.tsx`  
Expected: FAIL because image picking and workspace path entry are still desktop/mobile-specific.

- [ ] **Step 2: Add a browser file picker helper and route `pickImageFiles()` through it**

```ts
// src/services/browserFiles.ts
const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff,.tif,.heic,.heif";

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

export async function pickBrowserImageFiles(): Promise<string[]> {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = IMAGE_ACCEPT;
  input.multiple = true;

  const files = await new Promise<File[]>((resolve) => {
    input.addEventListener(
      "change",
      () => resolve(Array.from(input.files ?? [])),
      { once: true },
    );
    input.click();
  });

  const dataUrls = await Promise.all(files.map(readFileAsDataUrl));
  return dataUrls.filter(Boolean);
}
```

```ts
// src/services/tauri.ts
import { pickBrowserImageFiles } from "./browserFiles";

export async function pickImageFiles(): Promise<string[]> {
  if (isWebRuntime()) {
    return pickBrowserImageFiles();
  }
  const selection = await open({
    multiple: true,
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif"] }],
  });
  if (!selection) {
    return [];
  }
  return Array.isArray(selection) ? selection : [selection];
}
```

- [ ] **Step 3: Keep paste, disable drag-drop, and reuse the remote path prompt in web runtime**

```ts
// src/features/composer/hooks/useComposerImageDrop.ts
import { isWebRuntime } from "@services/runtime";

export function useComposerImageDrop({ disabled, onAttachImages }: UseComposerImageDropArgs) {
  const webRuntime = isWebRuntime();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (disabled || webRuntime) {
      return;
    }
    if (isDragFileTransfer(event.dataTransfer?.types)) {
      event.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    if (disabled || webRuntime) {
      return;
    }
    event.preventDefault();
    setIsDragOver(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    const fileImages = files.filter((file) => file.type.startsWith("image/"));
    const dataUrls = await readFilesAsDataUrls(fileImages);
    if (dataUrls.length > 0) {
      onAttachImages?.(dataUrls);
    }
  };
}
```

```ts
// src/features/app/hooks/useWorkspaceDialogs.ts
import { isWebRuntime } from "@services/runtime";

const requestWorkspacePaths = useCallback(async (backendMode?: string) => {
  if (isWebRuntime()) {
    return requestMobileRemoteWorkspacePaths();
  }
  if (isMobilePlatform() && backendMode === "remote") {
    return requestMobileRemoteWorkspacePaths();
  }
  return pickWorkspacePaths();
}, [requestMobileRemoteWorkspacePaths]);
```

This keeps the existing server-path modal as the only path entry UX in the web build.

- [ ] **Step 4: Run the image and path-entry tests**

Run: `npm run test -- src/features/composer/hooks/useComposerImages.test.ts src/features/composer/hooks/useComposerImageDrop.test.ts src/features/app/hooks/useWorkspaceController.test.tsx`  
Expected: PASS, with web runtime using browser file input, paste still working, and drag-drop inert.

- [ ] **Step 5: Commit**

```bash
git add src/services/browserFiles.ts src/services/tauri.ts src/features/composer/hooks/useComposerImages.ts src/features/composer/hooks/useComposerImageDrop.ts src/features/app/hooks/useWorkspaceDialogs.ts src/features/app/hooks/useWorkspaceController.ts src/features/composer/hooks/useComposerImages.test.ts src/features/composer/hooks/useComposerImageDrop.test.ts src/features/app/hooks/useWorkspaceController.test.tsx
git commit -m "feat: add browser image and remote path flows for web runtime"
```

### Task 4: Hide desktop-only shell and settings surfaces in the web build

**Files:**
- Modify: `src/features/app/components/MainAppShell.tsx`
- Modify: `src/features/app/bootstrap/useAppBootstrap.ts`
- Modify: `src/features/app/hooks/useLiquidGlassEffect.ts`
- Modify: `src/features/app/hooks/useUpdaterController.ts`
- Modify: `src/features/settings/components/SettingsNav.tsx`
- Modify: `src/features/settings/components/SettingsView.tsx`
- Modify: `src/features/settings/components/sections/SettingsAboutSection.tsx`
- Modify: `src/features/settings/components/sections/SettingsServerSection.tsx`
- Modify: `src/features/settings/hooks/useSettingsViewNavigation.ts`
- Modify: `src/features/settings/hooks/useSettingsViewOrchestration.ts`
- Modify: `src/features/messages/hooks/useFileLinkOpener.ts`
- Modify: `src/features/app/components/OpenAppMenu.tsx`
- Test: `src/features/settings/components/SettingsView.test.tsx`
- Test: `src/features/layout/components/WindowCaptionControls.test.tsx`
- Test: `src/features/messages/hooks/useFileLinkOpener.test.tsx`

- [ ] **Step 1: Add failing UI tests for web-only section filtering and desktop control removal**

```ts
// src/features/settings/components/SettingsView.test.tsx
it("shows only the web-safe settings sections in web runtime", async () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

  const props: ComponentProps<typeof SettingsView> = {
    reduceTransparency: false,
    onToggleTransparency: vi.fn(),
    appSettings: baseSettings,
    openAppIconById: {},
    onUpdateAppSettings: vi.fn().mockResolvedValue(undefined),
    workspaceGroups: [],
    groupedWorkspaces: [],
    ungroupedLabel: "Ungrouped",
    onClose: vi.fn(),
    onMoveWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onCreateWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRenameWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onMoveWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onDeleteWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onAssignWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRunDoctor: vi.fn().mockResolvedValue(createDoctorResult()),
    onUpdateWorkspaceSettings: vi.fn().mockResolvedValue(undefined),
    scaleShortcutTitle: "Scale shortcut",
    scaleShortcutText: "Use Command +/-",
    onTestNotificationSound: vi.fn(),
    onTestSystemNotification: vi.fn(),
    dictationModelStatus: null,
    onDownloadDictationModel: vi.fn(),
    onCancelDictationDownload: vi.fn(),
    onRemoveDictationModel: vi.fn(),
  };

  render(<SettingsView {...props} />);

  expect(screen.getByRole("button", { name: "Projects" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Server" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Dictation" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Open in" })).not.toBeInTheDocument();
});
```

```ts
// src/features/layout/components/WindowCaptionControls.test.tsx
it("does not render in web runtime", () => {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  render(<WindowCaptionControls />);
  expect(screen.queryByRole("group", { name: "Window controls" })).not.toBeInTheDocument();
});
```

Run: `npm run test -- src/features/settings/components/SettingsView.test.tsx src/features/layout/components/WindowCaptionControls.test.tsx src/features/messages/hooks/useFileLinkOpener.test.tsx`  
Expected: FAIL because the shell and settings still assume desktop-first behavior.

- [ ] **Step 2: Add a runtime-aware settings section list and enforce it in navigation**

```ts
// src/features/settings/components/SettingsNav.tsx
const WEB_VISIBLE_SECTIONS: CodexSection[] = [
  "projects",
  "display",
  "composer",
  "git",
  "about",
];

type SettingsNavProps = {
  activeSection: CodexSection;
  visibleSections?: CodexSection[];
  onSelectSection: (section: CodexSection) => void;
  showDisclosure?: boolean;
};

const visible = visibleSections ?? SETTINGS_ROUTE_SECTION_IDS.filter(
  (section): section is CodexSection => section !== "profile",
);
```

```ts
// src/features/settings/hooks/useSettingsViewNavigation.ts
type UseSettingsViewNavigationParams = {
  initialSection?: CodexSection;
  visibleSections?: CodexSection[];
};

useEffect(() => {
  if (!visibleSections?.length) {
    return;
  }
  if (!visibleSections.includes(activeSection)) {
    setActiveSection(visibleSections[0]);
  }
}, [activeSection, visibleSections]);
```

- [ ] **Step 3: No-op desktop chrome and update controls in web runtime**

```ts
// src/features/app/components/MainAppShell.tsx
import { isWebRuntime } from "@services/runtime";

const webRuntime = isWebRuntime();

return (
  <div
    className={`${appClassName}${isResizing ? " is-resizing" : ""}`}
    style={appStyle}
    ref={appRef}
  >
    {!webRuntime ? <div className="drag-strip" id="titlebar" /> : null}
    {!webRuntime ? <TitlebarExpandControls {...sidebarToggleProps} /> : null}
    {!webRuntime && <WindowCaptionControls />}
    <AppLayout {...appLayoutProps} />
  </div>
);
```

```ts
// src/features/app/hooks/useLiquidGlassEffect.ts
import { isWebRuntime } from "@services/runtime";

useEffect(() => {
  if (isWebRuntime()) {
    return;
  }
  let cancelled = false;
  void apply();
  return () => {
    cancelled = true;
  };
}, [onDebug, reduceTransparency]);
```

```ts
// src/features/settings/components/sections/SettingsAboutSection.tsx
const webRuntime = isWebRuntime();

{webRuntime ? (
  <div className="settings-help">App updates are managed outside the web build.</div>
) : (
  <button
    type="button"
    className="ghost"
    disabled={
      !updaterEnabled ||
      updaterState.stage === "checking" ||
      updaterState.stage === "downloading" ||
      updaterState.stage === "installing" ||
      updaterState.stage === "restarting"
    }
    onClick={() => void checkForUpdates({ announceNoUpdate: true })}
  >
    {updaterState.stage === "checking" ? "Checking..." : "Check for updates"}
  </button>
)}
```

- [ ] **Step 4: Disable local “open in app” actions in web runtime**

```ts
// src/features/messages/hooks/useFileLinkOpener.ts
import { isWebRuntime } from "@services/runtime";

if (isWebRuntime()) {
  return {
    openFileLink: async () => {
      pushErrorToast({
        title: "Unavailable in browser",
        message: "Open in app actions are only available in the desktop build.",
      });
    },
    showFileLinkMenu: async (event: MouseEvent) => {
      event.preventDefault();
    },
  };
}
```

```ts
// src/features/app/components/OpenAppMenu.tsx
if (isWebRuntime()) {
  return null;
}
```

- [ ] **Step 5: Run the shell and settings tests**

Run: `npm run test -- src/features/settings/components/SettingsView.test.tsx src/features/layout/components/WindowCaptionControls.test.tsx src/features/messages/hooks/useFileLinkOpener.test.tsx`  
Expected: PASS, with web runtime exposing only the minimal settings surface and no desktop-only open actions.

- [ ] **Step 6: Commit**

```bash
git add src/features/app/components/MainAppShell.tsx src/features/app/bootstrap/useAppBootstrap.ts src/features/app/hooks/useLiquidGlassEffect.ts src/features/app/hooks/useUpdaterController.ts src/features/settings/components/SettingsNav.tsx src/features/settings/components/SettingsView.tsx src/features/settings/components/sections/SettingsAboutSection.tsx src/features/settings/components/sections/SettingsServerSection.tsx src/features/settings/hooks/useSettingsViewNavigation.ts src/features/settings/hooks/useSettingsViewOrchestration.ts src/features/messages/hooks/useFileLinkOpener.ts src/features/app/components/OpenAppMenu.tsx src/features/settings/components/SettingsView.test.tsx src/features/layout/components/WindowCaptionControls.test.tsx src/features/messages/hooks/useFileLinkOpener.test.tsx
git commit -m "feat: hide desktop-only shell and settings in web runtime"
```

### Task 5: Extract the daemon wire protocol into a shared Rust module

**Files:**
- Create: `src-tauri/src/shared/daemon_wire.rs`
- Modify: `src-tauri/src/shared/mod.rs`
- Modify: `src-tauri/src/remote_backend/protocol.rs`

- [ ] **Step 1: Write the failing Rust wire-format tests**

```rust
// src-tauri/src/shared/daemon_wire.rs
#[cfg(test)]
mod tests {
    use super::{build_request_line, parse_incoming_line, IncomingMessage};
    use serde_json::json;

    #[test]
    fn builds_request_lines_with_id_method_and_params() {
        let line = build_request_line(7, "list_workspaces", json!({})).unwrap();
        assert!(line.contains("\"id\":7"));
        assert!(line.contains("\"method\":\"list_workspaces\""));
    }

    #[test]
    fn parses_result_responses() {
        let parsed = parse_incoming_line("{\"id\":1,\"result\":{\"ok\":true}}").unwrap();
        match parsed {
            IncomingMessage::Response { id, payload } => {
                assert_eq!(id, 1);
                assert_eq!(payload.unwrap()["ok"], true);
            }
            _ => panic!("expected response"),
        }
    }
}
```

Run: `cd src-tauri && cargo test daemon_wire`  
Expected: FAIL because `src-tauri/src/shared/daemon_wire.rs` is missing.

- [ ] **Step 2: Move the shared wire helpers into `shared/daemon_wire.rs`**

```rust
// src-tauri/src/shared/daemon_wire.rs
use serde_json::{json, Value};

pub(crate) const DEFAULT_REMOTE_HOST: &str = "127.0.0.1:4732";
pub(crate) const DISCONNECTED_MESSAGE: &str = "remote backend disconnected";

pub(crate) enum IncomingMessage {
    Response { id: u64, payload: Result<Value, String> },
    Notification { method: String, params: Value },
}

pub(crate) fn build_request_line(id: u64, method: &str, params: Value) -> Result<String, String> {
    serde_json::to_string(&json!({ "id": id, "method": method, "params": params }))
        .map_err(|err| err.to_string())
}

pub(crate) fn parse_incoming_line(line: &str) -> Option<IncomingMessage> {
    let message: Value = serde_json::from_str(line).ok()?;
    if let Some(id) = message.get("id").and_then(|value| value.as_u64()) {
        if let Some(error) = message.get("error") {
            let error_message = error
                .get("message")
                .and_then(|value| value.as_str())
                .unwrap_or("remote error")
                .to_string();
            return Some(IncomingMessage::Response {
                id,
                payload: Err(error_message),
            });
        }

        return Some(IncomingMessage::Response {
            id,
            payload: Ok(message.get("result").cloned().unwrap_or(Value::Null)),
        });
    }

    let method = message.get("method").and_then(|value| value.as_str())?;
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    Some(IncomingMessage::Notification {
        method: method.to_string(),
        params,
    })
}
```

```rust
// src-tauri/src/remote_backend/protocol.rs
pub(crate) use crate::shared::daemon_wire::{
    build_request_line,
    parse_incoming_line,
    IncomingMessage,
    DEFAULT_REMOTE_HOST,
    DISCONNECTED_MESSAGE,
};
```

- [ ] **Step 3: Run the Rust wire-format tests**

Run: `cd src-tauri && cargo test daemon_wire`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/shared/daemon_wire.rs src-tauri/src/shared/mod.rs src-tauri/src/remote_backend/protocol.rs
git commit -m "refactor: share daemon wire protocol helpers"
```

### Task 6: Add the web bridge Rust binary and daemon client

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/bin/codex_monitor_web_bridge.rs`
- Create: `src-tauri/src/bin/codex_monitor_web_bridge/config.rs`
- Create: `src-tauri/src/bin/codex_monitor_web_bridge/state.rs`
- Create: `src-tauri/src/bin/codex_monitor_web_bridge/daemon_client.rs`
- Create: `src-tauri/src/bin/codex_monitor_web_bridge/routes.rs`
- Create: `src-tauri/src/bin/codex_monitor_web_bridge/auth.rs`

- [ ] **Step 1: Add failing bridge tests for allowlisted RPC forwarding and websocket event fanout**

```rust
// src-tauri/src/bin/codex_monitor_web_bridge/daemon_client.rs
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn forwards_rpc_requests_to_the_daemon_connection() {
        let (client, mut server) = test_client_pair().await;
        server.enqueue_result(1, json!({ "ok": true })).await;

        let result = client.call("list_workspaces", json!({})).await.unwrap();

        assert_eq!(result["ok"], true);
        assert_eq!(server.last_method().await, "list_workspaces");
    }
}
```

```rust
// src-tauri/src/bin/codex_monitor_web_bridge/routes.rs
#[tokio::test]
async fn rejects_methods_outside_the_allowlist() {
    let app = build_router(test_state());
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/rpc")
                .header("content-type", "application/json")
                .header("cf-access-jwt-assertion", "present")
                .body(Body::from(r#"{"method":"delete_everything","params":{}}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}
```

Run: `cd src-tauri && cargo test codex_monitor_web_bridge`  
Expected: FAIL because the new bridge binary modules do not exist yet.

- [ ] **Step 2: Add bridge configuration, auth middleware, and daemon client**

```rust
// src-tauri/src/bin/codex_monitor_web_bridge/config.rs
use std::net::SocketAddr;

#[derive(Clone)]
pub(crate) struct BridgeConfig {
    pub(crate) listen: SocketAddr,
    pub(crate) daemon_host: String,
    pub(crate) daemon_token: Option<String>,
    pub(crate) require_cf_access_header: bool,
}
```

```rust
// src-tauri/src/bin/codex_monitor_web_bridge/auth.rs
use axum::http::{HeaderMap, StatusCode};

pub(crate) fn require_bridge_headers(
    headers: &HeaderMap,
    require_cf_access_header: bool,
) -> Result<(), (StatusCode, String)> {
    if require_cf_access_header && headers.get("cf-access-jwt-assertion").is_none() {
        return Err((StatusCode::UNAUTHORIZED, "missing Cloudflare access header".to_string()));
    }
    Ok(())
}
```

```rust
// src-tauri/src/bin/codex_monitor_web_bridge/daemon_client.rs
use crate::shared::daemon_wire::{build_request_line, parse_incoming_line, IncomingMessage};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, oneshot, Mutex};

pub(crate) struct DaemonClient {
    out_tx: mpsc::Sender<String>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    next_id: AtomicU64,
    events_tx: broadcast::Sender<String>,
}

impl DaemonClient {
    pub(crate) async fn call(&self, method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        let line = build_request_line(id, method, params)?;
        self.out_tx
            .send(line)
            .await
            .map_err(|_| "bridge lost daemon connection".to_string())?;
        rx.await
            .map_err(|_| "bridge lost daemon response channel".to_string())?
    }
}
```

- [ ] **Step 3: Expose allowlisted `/api/rpc` and `/ws` routes**

```rust
// src-tauri/src/bin/codex_monitor_web_bridge/routes.rs
const ALLOWED_RPC_METHODS: &[&str] = &[
    "list_workspaces",
    "add_workspace",
    "connect_workspace",
    "list_threads",
    "start_thread",
    "read_thread",
    "resume_thread",
    "set_thread_name",
    "archive_thread",
    "send_user_message",
    "turn_interrupt",
    "thread_live_subscribe",
    "thread_live_unsubscribe",
    "get_git_status",
    "get_git_diffs",
    "get_git_log",
    "list_git_branches",
    "get_git_commit_diff",
    "get_git_remote",
    "get_app_settings",
    "update_app_settings",
    "get_config_model",
    "model_list",
    "collaboration_mode_list",
    "skills_list",
    "apps_list",
    "prompts_list",
    "account_rate_limits",
    "account_read",
];

pub(crate) fn build_router(state: BridgeState) -> Router {
    Router::new()
        .route("/api/rpc", post(rpc_handler))
        .route("/ws", get(ws_handler))
        .with_state(state)
}
```

```rust
async fn rpc_handler(
    State(state): State<BridgeState>,
    headers: HeaderMap,
    Json(request): Json<RpcRequest>,
) -> Result<Json<RpcResponse>, (StatusCode, String)> {
    require_bridge_headers(&headers, state.config.require_cf_access_header)?;

    if !ALLOWED_RPC_METHODS.contains(&request.method.as_str()) {
        return Err((StatusCode::FORBIDDEN, "bridge denied method".to_string()));
    }

    let result = state.daemon_client.call(&request.method, request.params).await
        .map_err(|message| (StatusCode::BAD_GATEWAY, message))?;

    Ok(Json(RpcResponse { result }))
}
```

For websocket forwarding, keep the daemon notification envelope intact:

```rust
{"method":"app-server-event","params":{"workspace_id":"ws-1","message":{"method":"thread/started"}}}
```

That lets the existing frontend event hub stay simple.

- [ ] **Step 4: Add the bridge binary entrypoint**

```rust
// src-tauri/src/bin/codex_monitor_web_bridge.rs
mod auth;
mod config;
mod daemon_client;
mod routes;
mod state;

#[path = "../shared/mod.rs"]
mod shared;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = config::load_from_env()?;
    let state = state::build(config).await?;
    let listener = tokio::net::TcpListener::bind(state.config.listen).await?;
    axum::serve(listener, routes::build_router(state)).await?;
    Ok(())
}
```

- [ ] **Step 5: Run Rust bridge tests and compile checks**

Run: `cd src-tauri && cargo test codex_monitor_web_bridge && cargo check --bin codex_monitor_web_bridge`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/bin/codex_monitor_web_bridge.rs src-tauri/src/bin/codex_monitor_web_bridge/config.rs src-tauri/src/bin/codex_monitor_web_bridge/state.rs src-tauri/src/bin/codex_monitor_web_bridge/daemon_client.rs src-tauri/src/bin/codex_monitor_web_bridge/routes.rs src-tauri/src/bin/codex_monitor_web_bridge/auth.rs
git commit -m "feat: add web bridge binary for browser clients"
```

### Task 7: Wire build scripts, docs, and final verification

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `README.md`
- Modify: `docs/codebase-map.md`

- [ ] **Step 1: Add web-runtime scripts and env wiring**

```json
// package.json
{
  "scripts": {
    "dev:web": "VITE_CODEXMONITOR_RUNTIME=web vite",
    "build:web": "VITE_CODEXMONITOR_RUNTIME=web tsc && vite build",
    "bridge:check": "cd src-tauri && cargo check --bin codex_monitor_web_bridge"
  }
}
```

```ts
// vite.config.ts
define: {
  __APP_VERSION__: JSON.stringify(packageJson.version),
  __APP_COMMIT_HASH__: JSON.stringify(appCommitHash),
  __APP_BUILD_DATE__: JSON.stringify(appBuildDate),
  __APP_GIT_BRANCH__: JSON.stringify(appGitBranch),
},
server: {
  port: 1420,
  strictPort: true,
}
```

Use `.env.local` or deployment env to set:

```bash
VITE_CODEXMONITOR_RUNTIME=web
VITE_CODEXMONITOR_BRIDGE_URL=https://bridge.example.com
```

- [ ] **Step 2: Document the web bridge entrypoints and deployment shape**

```md
<!-- README.md -->
## Web Bridge V1

Use `npm run build:web` to produce the browser build.

Run the bridge on the server side with:

```bash
cd src-tauri
cargo run --bin codex_monitor_web_bridge
```

Place Cloudflare in front of the bridge and keep the daemon private.
```

```md
<!-- docs/codebase-map.md -->
| Add/change browser bridge behavior | `src/services/runtime.ts`, `src/services/bridge/*`, `src/services/tauri.ts`, `src/services/events.ts`, `src-tauri/src/bin/codex_monitor_web_bridge.rs`, `src-tauri/src/bin/codex_monitor_web_bridge/*` |
```

- [ ] **Step 3: Run the full verification set**

Run: `npm run test`  
Expected: PASS

Run: `npm run typecheck`  
Expected: PASS

Run: `cd src-tauri && cargo test daemon_wire codex_monitor_web_bridge && cargo check --bin codex_monitor_web_bridge`  
Expected: PASS

Run: `npm run build:web`  
Expected: PASS and produce `dist/`

- [ ] **Step 4: Commit**

```bash
git add package.json vite.config.ts README.md docs/codebase-map.md
git commit -m "docs: add web bridge build and deployment notes"
```
