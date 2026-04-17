import type {
  LoadedWebBridgeSettings,
  NormalizedBridgeUrlResult,
  WebBridgeDraft,
  WebBridgeSettings,
  WebBridgeTarget,
} from "./types";

export const WEB_BRIDGE_STORAGE_KEY = "codexmonitor.webBridgeSettings.v1";

type LoadWebBridgeSettingsOptions = {
  seedUrl?: string | null;
  nowMs?: number;
};

type AddWebBridgeTargetOptions = WebBridgeDraft & {
  nowMs: number;
  activate?: boolean;
};

type EditWebBridgeTargetOptions = WebBridgeDraft & {
  nowMs: number;
};

function getLocalStorage(): Storage | null {
  if ("localStorage" in globalThis) {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  }
  if (typeof window !== "undefined") {
    return window.localStorage;
  }
  return null;
}

function normalizeUrlTrailingSlashes(value: string): string {
  return value.replace(/\/+$/u, "");
}

function isLocalHost(hostname: string): boolean {
  const normalizedHostname = hostname.replace(/^\[(.*)\]$/u, "$1");
  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "::1" ||
    normalizedHostname.endsWith(".local")
  );
}

function makeBridgeId(nowMs: number): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `bridge-${nowMs}-${random}`;
}

function parseStoredSettings(raw: string | null): WebBridgeSettings | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WebBridgeSettings> & {
      bridges?: unknown;
    };
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.bridges)) {
      return null;
    }
    const bridges = parsed.bridges.filter((item): item is WebBridgeTarget => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const candidate = item as WebBridgeTarget;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.baseUrl === "string" &&
        typeof candidate.createdAtMs === "number" &&
        typeof candidate.updatedAtMs === "number" &&
        (candidate.lastUsedAtMs === null || typeof candidate.lastUsedAtMs === "number")
      );
    });
    if (bridges.length !== parsed.bridges.length) {
      return null;
    }
    if (
      typeof parsed.activeBridgeId !== "string" &&
      parsed.activeBridgeId !== null
    ) {
      return null;
    }
    return {
      version: 1,
      activeBridgeId: parsed.activeBridgeId ?? null,
      bridges,
    };
  } catch {
    return null;
  }
}

export function normalizeWebBridgeUrl(value: string): NormalizedBridgeUrlResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: "Bridge URL is required." };
  }

  if (!/^https?:\/\//iu.test(trimmed)) {
    return {
      ok: false,
      error: "Bridge URL must start with http:// or https://.",
    };
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        ok: false,
        error: "Bridge URL must start with http:// or https://.",
      };
    }
    const normalized = normalizeUrlTrailingSlashes(url.toString());
    const warning =
      url.protocol === "http:" && !isLocalHost(url.hostname)
        ? "Plain HTTP should only be used for trusted development hosts."
        : null;
    return {
      ok: true,
      value: normalized,
      warning,
    };
  } catch {
    return {
      ok: false,
      error: "Bridge URL must start with http:// or https://.",
    };
  }
}

export function deriveBridgeName(name: string, baseUrl: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    return trimmed;
  }
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl.trim();
  }
}

export function loadWebBridgeSettings(
  options: LoadWebBridgeSettingsOptions = {},
): LoadedWebBridgeSettings {
  const seedUrlResult = options.seedUrl
    ? normalizeWebBridgeUrl(options.seedUrl)
    : null;
  const seedNormalized = seedUrlResult && seedUrlResult.ok ? seedUrlResult.value : null;

  const storage = getLocalStorage();
  if (!storage) {
    return {
      version: 1,
      activeBridgeId: null,
      bridges: [],
      seedBridgeUrl: seedNormalized,
    };
  }

  const stored = parseStoredSettings(storage.getItem(WEB_BRIDGE_STORAGE_KEY));
  if (!stored) {
    return {
      version: 1,
      activeBridgeId: null,
      bridges: [],
      seedBridgeUrl: seedNormalized,
    };
  }

  return {
    ...stored,
    seedBridgeUrl: seedNormalized,
  };
}

export function saveWebBridgeSettings(settings: WebBridgeSettings): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(WEB_BRIDGE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Best-effort persistence.
  }
}

export function getActiveWebBridge(
  settings: WebBridgeSettings,
): WebBridgeTarget | null {
  return (
    settings.bridges.find((bridge) => bridge.id === settings.activeBridgeId) ?? null
  );
}

export function addWebBridgeTarget(
  settings: WebBridgeSettings,
  options: AddWebBridgeTargetOptions,
): WebBridgeSettings {
  const normalized = normalizeWebBridgeUrl(options.baseUrl);
  if (!normalized.ok) {
    throw new Error(normalized.error);
  }
  const nowMs = options.nowMs;
  const next: WebBridgeTarget = {
    id: makeBridgeId(nowMs),
    name: deriveBridgeName(options.name, normalized.value),
    baseUrl: normalized.value,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    lastUsedAtMs: null,
  };

  const bridges = [...settings.bridges, next];
  return {
    version: 1,
    activeBridgeId: options.activate ? next.id : settings.activeBridgeId,
    bridges,
  };
}

export function editWebBridgeTarget(
  settings: WebBridgeSettings,
  id: string,
  options: EditWebBridgeTargetOptions,
): WebBridgeSettings {
  const normalized = normalizeWebBridgeUrl(options.baseUrl);
  if (!normalized.ok) {
    throw new Error(normalized.error);
  }
  const index = settings.bridges.findIndex((bridge) => bridge.id === id);
  if (index === -1) {
    throw new Error("Bridge not found.");
  }
  const updated = settings.bridges.map((bridge) =>
    bridge.id === id
      ? {
          ...bridge,
          name: deriveBridgeName(options.name, normalized.value),
          baseUrl: normalized.value,
          updatedAtMs: options.nowMs,
        }
      : bridge,
  );

  return {
    ...settings,
    bridges: updated,
  };
}

export function activateWebBridgeTarget(
  settings: WebBridgeSettings,
  id: string,
  nowMs: number,
): WebBridgeSettings {
  let found = false;
  const bridges = settings.bridges.map((bridge) => {
    if (bridge.id !== id) {
      return bridge;
    }
    found = true;
    return {
      ...bridge,
      lastUsedAtMs: nowMs,
    };
  });

  if (!found) {
    throw new Error("Bridge not found.");
  }

  return {
    ...settings,
    activeBridgeId: id,
    bridges,
  };
}

export function deleteWebBridgeTarget(
  settings: WebBridgeSettings,
  id: string,
  replacementActiveBridgeId?: string | null,
): WebBridgeSettings {
  if (settings.bridges.length <= 1) {
    throw new Error("At least one Bridge must remain configured.");
  }

  const target = settings.bridges.find((bridge) => bridge.id === id);
  if (!target) {
    throw new Error("Bridge not found.");
  }

  const bridges = settings.bridges.filter((bridge) => bridge.id !== id);
  let activeBridgeId = settings.activeBridgeId;

  if (settings.activeBridgeId === id) {
    const replacement =
      replacementActiveBridgeId &&
      bridges.some((bridge) => bridge.id === replacementActiveBridgeId)
        ? replacementActiveBridgeId
        : bridges[0]?.id ?? null;
    activeBridgeId = replacement;
  }

  return {
    ...settings,
    activeBridgeId,
    bridges,
  };
}
