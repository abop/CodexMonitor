export type AppRuntime = "desktop" | "web";

export type RuntimeConfig = {
  runtime: AppRuntime;
  bridgeBaseUrl: string | null;
};

let runtimeBridgeBaseUrlOverride: string | null = null;
const runtimeBridgeBaseUrlListeners = new Set<
  (baseUrl: string | null) => void
>();

function normalizeBridgeBaseUrl(value?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}

export function setRuntimeBridgeBaseUrl(value: string | null) {
  runtimeBridgeBaseUrlOverride = normalizeBridgeBaseUrl(value ?? undefined);
  runtimeBridgeBaseUrlListeners.forEach((listener) => {
    listener(runtimeBridgeBaseUrlOverride);
  });
}

export function getRuntimeBridgeBaseUrl() {
  return runtimeBridgeBaseUrlOverride;
}

export function subscribeRuntimeBridgeBaseUrl(
  listener: (baseUrl: string | null) => void,
) {
  runtimeBridgeBaseUrlListeners.add(listener);
  return () => {
    runtimeBridgeBaseUrlListeners.delete(listener);
  };
}

export function resetRuntimeBridgeBaseUrlForTests() {
  runtimeBridgeBaseUrlOverride = null;
  runtimeBridgeBaseUrlListeners.clear();
}

export function resolveAppRuntime(options: {
  runtimeEnv?: string;
  hasTauri?: boolean;
}): AppRuntime {
  if (options.runtimeEnv === "desktop") {
    return "desktop";
  }
  if (options.runtimeEnv === "web") {
    return "web";
  }
  return "desktop";
}

export function readRuntimeConfig(): RuntimeConfig {
  const hasTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  return {
    runtime: resolveAppRuntime({
      runtimeEnv: import.meta.env.VITE_CODEXMONITOR_RUNTIME,
      hasTauri,
    }),
    bridgeBaseUrl:
      runtimeBridgeBaseUrlOverride ??
      normalizeBridgeBaseUrl(import.meta.env.VITE_CODEXMONITOR_BRIDGE_URL),
  };
}

export function isWebRuntime() {
  return readRuntimeConfig().runtime === "web";
}
