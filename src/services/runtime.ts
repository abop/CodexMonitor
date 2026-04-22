export type AppRuntime = "desktop" | "web";

export type RuntimeConfig = {
  runtime: AppRuntime;
  backendBaseUrl: string | null;
};

let runtimeBackendBaseUrlOverride: string | null = null;
const runtimeBackendBaseUrlListeners = new Set<
  (baseUrl: string | null) => void
>();

function normalizeBackendBaseUrl(value?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}

export function setRuntimeBackendBaseUrl(value: string | null) {
  runtimeBackendBaseUrlOverride = normalizeBackendBaseUrl(value ?? undefined);
  const listeners = Array.from(runtimeBackendBaseUrlListeners);
  listeners.forEach((listener) => {
    listener(runtimeBackendBaseUrlOverride);
  });
}

export function subscribeRuntimeBackendBaseUrl(
  listener: (baseUrl: string | null) => void,
) {
  runtimeBackendBaseUrlListeners.add(listener);
  return () => {
    runtimeBackendBaseUrlListeners.delete(listener);
  };
}

export function resetRuntimeBackendBaseUrlForTests() {
  runtimeBackendBaseUrlOverride = null;
  runtimeBackendBaseUrlListeners.clear();
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
  return {
    runtime: resolveAppRuntime({
      runtimeEnv: import.meta.env.VITE_CODEXMONITOR_RUNTIME,
      hasTauri,
    }),
    backendBaseUrl:
      runtimeBackendBaseUrlOverride ??
      normalizeBackendBaseUrl(import.meta.env.VITE_CODEXMONITOR_BACKEND_URL),
  };
}

export function isWebRuntime() {
  return readRuntimeConfig().runtime === "web";
}
