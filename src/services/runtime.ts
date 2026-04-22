export type AppRuntime = "desktop" | "web";

export type RuntimeWebBackend = {
  id: string;
  name: string;
  baseUrl: string;
  token: string | null;
};

export type RuntimeWebBackendInput = {
  id?: string;
  name: string;
  baseUrl: string;
  token?: string | null;
};

export type RuntimeConfig = {
  runtime: AppRuntime;
  backendBaseUrl: string | null;
  backendToken: string | null;
  activeBackend: RuntimeWebBackend | null;
};

type RuntimeWebBackendStore = {
  version: 1;
  activeBackendId: string | null;
  backends: RuntimeWebBackend[];
};

type RuntimeConfigListener = (config: RuntimeConfig) => void;

const WEB_BACKEND_STORAGE_KEY = "codexmonitor.web-backends";

let runtimeBackendBaseUrlOverride: string | null = null;
const runtimeConfigListeners = new Set<RuntimeConfigListener>();

function normalizeBackendBaseUrl(value?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}

function normalizeBackendToken(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeBackendName(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeRuntimeWebBackend(
  value: Partial<RuntimeWebBackend> | null | undefined,
): RuntimeWebBackend | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const baseUrl = normalizeBackendBaseUrl(value.baseUrl);
  const name = normalizeBackendName(value.name);
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!baseUrl || !name || !id) {
    return null;
  }
  return {
    id,
    name,
    baseUrl,
    token: normalizeBackendToken(value.token),
  };
}

function isRuntimeWebBackend(value: RuntimeWebBackend | null): value is RuntimeWebBackend {
  return value !== null;
}

function createRuntimeWebBackendId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `backend-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readStoredRuntimeWebBackends(): RuntimeWebBackendStore {
  const storage = getStorage();
  if (!storage) {
    return {
      version: 1,
      activeBackendId: null,
      backends: [],
    };
  }

  try {
    const raw = storage.getItem(WEB_BACKEND_STORAGE_KEY);
    if (!raw) {
      return {
        version: 1,
        activeBackendId: null,
        backends: [],
      };
    }
    const parsed = JSON.parse(raw) as Partial<RuntimeWebBackendStore>;
    const backends = Array.isArray(parsed?.backends)
      ? parsed.backends.map(normalizeRuntimeWebBackend).filter(isRuntimeWebBackend)
      : [];
    const activeBackendId =
      typeof parsed?.activeBackendId === "string" ? parsed.activeBackendId : null;
    const hasActiveBackend = backends.some((backend) => backend.id === activeBackendId);
    return {
      version: 1,
      activeBackendId: hasActiveBackend ? activeBackendId : backends[0]?.id ?? null,
      backends,
    };
  } catch {
    return {
      version: 1,
      activeBackendId: null,
      backends: [],
    };
  }
}

function writeStoredRuntimeWebBackends(store: RuntimeWebBackendStore) {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  storage.setItem(WEB_BACKEND_STORAGE_KEY, JSON.stringify(store));
}

function notifyRuntimeConfigListeners() {
  const config = readRuntimeConfig();
  const listeners = Array.from(runtimeConfigListeners);
  listeners.forEach((listener) => {
    listener(config);
  });
}

function resolveStoredActiveBackend(): RuntimeWebBackend | null {
  const store = readStoredRuntimeWebBackends();
  if (!store.activeBackendId) {
    return null;
  }
  return store.backends.find((backend) => backend.id === store.activeBackendId) ?? null;
}

function resolveConfiguredBackend(): RuntimeWebBackend | null {
  const baseUrl = normalizeBackendBaseUrl(import.meta.env.VITE_CODEXMONITOR_BACKEND_URL);
  if (!baseUrl) {
    return null;
  }
  return {
    id: "configured-backend",
    name: "Configured backend",
    baseUrl,
    token: normalizeBackendToken(import.meta.env.VITE_CODEXMONITOR_BACKEND_TOKEN),
  };
}

export function setRuntimeBackendBaseUrl(value: string | null) {
  runtimeBackendBaseUrlOverride = normalizeBackendBaseUrl(value ?? undefined);
  notifyRuntimeConfigListeners();
}

export function subscribeRuntimeConfig(listener: RuntimeConfigListener) {
  runtimeConfigListeners.add(listener);
  return () => {
    runtimeConfigListeners.delete(listener);
  };
}

export function subscribeRuntimeBackendBaseUrl(
  listener: (baseUrl: string | null) => void,
) {
  return subscribeRuntimeConfig((config) => {
    listener(config.backendBaseUrl);
  });
}

export function resetRuntimeBackendBaseUrlForTests() {
  runtimeBackendBaseUrlOverride = null;
  runtimeConfigListeners.clear();
  const storage = getStorage();
  storage?.removeItem(WEB_BACKEND_STORAGE_KEY);
}

export function listRuntimeWebBackends() {
  return readStoredRuntimeWebBackends().backends;
}

export function upsertRuntimeWebBackend(
  input: RuntimeWebBackendInput,
  options?: { activate?: boolean },
) {
  const name = normalizeBackendName(input.name);
  const baseUrl = normalizeBackendBaseUrl(input.baseUrl);
  if (!name) {
    throw new Error("Backend name is required.");
  }
  if (!baseUrl) {
    throw new Error("Backend URL is required.");
  }

  const existing = input.id ? normalizeBackendName(input.id) : null;
  const backend: RuntimeWebBackend = {
    id: existing ?? createRuntimeWebBackendId(),
    name,
    baseUrl,
    token: normalizeBackendToken(input.token),
  };
  const store = readStoredRuntimeWebBackends();
  const nextBackends = store.backends.some((entry) => entry.id === backend.id)
    ? store.backends.map((entry) => (entry.id === backend.id ? backend : entry))
    : [...store.backends, backend];
  const nextStore: RuntimeWebBackendStore = {
    version: 1,
    activeBackendId:
      options?.activate || nextBackends.length === 1
        ? backend.id
        : store.activeBackendId ?? backend.id,
    backends: nextBackends,
  };

  runtimeBackendBaseUrlOverride = null;
  writeStoredRuntimeWebBackends(nextStore);
  notifyRuntimeConfigListeners();
  return backend;
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
  writeStoredRuntimeWebBackends({
    ...store,
    activeBackendId: backendId,
  });
  notifyRuntimeConfigListeners();
}

export function deleteRuntimeWebBackend(id: string) {
  const backendId = id.trim();
  if (!backendId) {
    throw new Error("Backend id is required.");
  }
  const store = readStoredRuntimeWebBackends();
  const nextBackends = store.backends.filter((backend) => backend.id !== backendId);
  if (nextBackends.length === store.backends.length) {
    return;
  }
  runtimeBackendBaseUrlOverride = null;
  writeStoredRuntimeWebBackends({
    version: 1,
    activeBackendId:
      store.activeBackendId === backendId
        ? nextBackends[0]?.id ?? null
        : store.activeBackendId,
    backends: nextBackends,
  });
  notifyRuntimeConfigListeners();
}

export function resolveAppRuntime(options: {
  runtimeEnv?: string;
  hasTauri?: boolean;
}): AppRuntime {
  if (options.runtimeEnv === "web") {
    return "web";
  }
  if (options.runtimeEnv === "desktop") {
    return "desktop";
  }
  return options.hasTauri ? "desktop" : "web";
}

export function readRuntimeConfig(): RuntimeConfig {
  const hasTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const runtime = resolveAppRuntime({
    runtimeEnv: import.meta.env.VITE_CODEXMONITOR_RUNTIME,
    hasTauri,
  });
  if (runtimeBackendBaseUrlOverride) {
    return {
      runtime,
      backendBaseUrl: runtimeBackendBaseUrlOverride,
      backendToken: null,
      activeBackend: {
        id: "runtime-override",
        name: "Current backend",
        baseUrl: runtimeBackendBaseUrlOverride,
        token: null,
      },
    };
  }

  const activeBackend = resolveStoredActiveBackend() ?? resolveConfiguredBackend();
  return {
    runtime,
    backendBaseUrl: activeBackend?.baseUrl ?? null,
    backendToken: activeBackend?.token ?? null,
    activeBackend,
  };
}

export function isWebRuntime() {
  return readRuntimeConfig().runtime === "web";
}
