export type AppRuntime = "desktop" | "web";

export type RuntimeConfig = {
  runtime: AppRuntime;
  bridgeBaseUrl: string | null;
};

function normalizeBridgeBaseUrl(value?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
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
    bridgeBaseUrl: normalizeBridgeBaseUrl(
      import.meta.env.VITE_CODEXMONITOR_BRIDGE_URL,
    ),
  };
}

export function isWebRuntime() {
  return readRuntimeConfig().runtime === "web";
}
