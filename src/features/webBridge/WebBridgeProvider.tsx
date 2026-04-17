import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { resetBridgeRealtimeClient } from "@services/events";
import {
  isWebRuntime,
  readRuntimeConfig,
  setRuntimeBridgeBaseUrl,
} from "@services/runtime";
import { testBridgeConnection } from "@services/bridge/http";
import type {
  LoadedWebBridgeSettings,
  WebBridgeDraft,
  WebBridgeSettings,
  WebBridgeTarget,
} from "./types";
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

type WebBridgeStatus = "idle" | "testing" | "switching";

type WebBridgeContextValue = {
  isWeb: boolean;
  setupRequired: boolean;
  seedBridgeUrl: string | null;
  bridges: WebBridgeTarget[];
  activeBridge: WebBridgeTarget | null;
  status: WebBridgeStatus;
  error: string | null;
  warning: string | null;
  saveFirstBridge: (draft: WebBridgeDraft) => Promise<void>;
  addBridge: (draft: WebBridgeDraft & { activate: boolean }) => Promise<void>;
  editBridge: (id: string, draft: WebBridgeDraft) => Promise<void>;
  switchBridge: (id: string) => Promise<void>;
  deleteBridge: (id: string, replacementId?: string | null) => Promise<void>;
  clearError: () => void;
};

type WebBridgeProviderProps = {
  children: ReactNode;
  testConnection?: (baseUrl: string) => Promise<void>;
  reloadApp?: () => void;
};

const WebBridgeContext = createContext<WebBridgeContextValue | null>(null);

const DEFAULT_TEST_CONNECTION = (baseUrl: string) =>
  testBridgeConnection({ baseUrl }).then(() => void 0);

function defaultReloadApp() {
  window.location.reload();
}

function persistSettings(settings: LoadedWebBridgeSettings) {
  const { seedBridgeUrl: _seedBridgeUrl, ...persisted } = settings;
  saveWebBridgeSettings(persisted);
}

function normalizeWarning(baseUrl: string | null) {
  if (!baseUrl) {
    return null;
  }
  const result = normalizeWebBridgeUrl(baseUrl);
  return result.ok ? result.warning : null;
}

function resolveReplacementBridge(
  settings: WebBridgeSettings,
  id: string,
  replacementId?: string | null,
) {
  if (replacementId) {
    const explicit = settings.bridges.find((bridge) => bridge.id === replacementId);
    if (explicit && explicit.id !== id) {
      return explicit;
    }
  }
  return settings.bridges.find((bridge) => bridge.id !== id) ?? null;
}

export function WebBridgeProvider({
  children,
  testConnection = DEFAULT_TEST_CONNECTION,
  reloadApp = defaultReloadApp,
}: WebBridgeProviderProps) {
  const isWeb = useMemo(() => isWebRuntime(), []);
  const initialSettings = useMemo(
    () => loadWebBridgeSettings({ seedUrl: readRuntimeConfig().bridgeBaseUrl }),
    [],
  );
  const settingsRef = useRef<LoadedWebBridgeSettings>(initialSettings);
  const [settings, setSettings] = useState<LoadedWebBridgeSettings>(initialSettings);
  const [status, setStatus] = useState<WebBridgeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(() => {
    const activeBridge = getActiveWebBridge(initialSettings);
    return activeBridge
      ? normalizeWarning(activeBridge.baseUrl)
      : normalizeWarning(initialSettings.seedBridgeUrl);
  });
  const pendingReloadRef = useRef(false);

  const activeBridge = useMemo(() => getActiveWebBridge(settings), [settings]);
  const setupRequired = isWeb && settings.bridges.length === 0;
  const seedBridgeUrl = settings.seedBridgeUrl;

  useEffect(() => {
    setRuntimeBridgeBaseUrl(activeBridge?.baseUrl ?? null);
    resetBridgeRealtimeClient();
    if (pendingReloadRef.current) {
      pendingReloadRef.current = false;
      reloadApp();
    }
  }, [
    activeBridge?.baseUrl,
    activeBridge?.id,
    reloadApp,
  ]);

  const updateSettings = useCallback((next: LoadedWebBridgeSettings) => {
    settingsRef.current = next;
    setSettings(next);
    setWarning(normalizeWarning(getActiveWebBridge(next)?.baseUrl ?? next.seedBridgeUrl));
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const performTest = useCallback(
    async (baseUrl: string) => {
      await testConnection(baseUrl);
    },
    [testConnection],
  );

  const saveFirstBridge = useCallback(
    async (draft: WebBridgeDraft) => {
      setStatus("testing");
      setError(null);

      const normalized = normalizeWebBridgeUrl(draft.baseUrl);
      if (!normalized.ok) {
        setStatus("idle");
        setError(normalized.error);
        return;
      }

      setWarning(normalized.warning);

      try {
        await performTest(normalized.value);
      } catch (cause) {
        setStatus("idle");
        setError(cause instanceof Error ? cause.message : "Bridge test failed.");
        return;
      }

      const next = addWebBridgeTarget(
        { version: 1, activeBridgeId: null, bridges: [] },
        {
          ...draft,
          baseUrl: normalized.value,
          nowMs: Date.now(),
          activate: true,
        },
      );
      const loaded: LoadedWebBridgeSettings = {
        ...next,
        seedBridgeUrl: settingsRef.current.seedBridgeUrl,
      };
      persistSettings(loaded);
      updateSettings(loaded);
      setStatus("idle");
    },
    [performTest, updateSettings],
  );

  const addBridge = useCallback(
    async (draft: WebBridgeDraft & { activate: boolean }) => {
      setStatus("testing");
      setError(null);

      const normalized = normalizeWebBridgeUrl(draft.baseUrl);
      if (!normalized.ok) {
        setStatus("idle");
        setError(normalized.error);
        return;
      }

      setWarning(normalized.warning);

      try {
        await performTest(normalized.value);
      } catch (cause) {
        setStatus("idle");
        setError(cause instanceof Error ? cause.message : "Bridge test failed.");
        return;
      }

      const currentSettings = settingsRef.current;
      const next = addWebBridgeTarget(currentSettings, {
        ...draft,
        baseUrl: normalized.value,
        nowMs: Date.now(),
      });
      const loaded: LoadedWebBridgeSettings = {
        ...next,
        seedBridgeUrl: currentSettings.seedBridgeUrl,
      };
      persistSettings(loaded);
      updateSettings(loaded);
      if (draft.activate) {
        pendingReloadRef.current = true;
        setStatus("switching");
      } else {
        setStatus("idle");
      }
    },
    [performTest, updateSettings],
  );

  const editBridge = useCallback(
    async (id: string, draft: WebBridgeDraft) => {
      const currentSettings = settingsRef.current;
      const current = currentSettings.bridges.find((bridge) => bridge.id === id);
      if (!current) {
        setError("Bridge not found.");
        return;
      }

      const normalized = normalizeWebBridgeUrl(draft.baseUrl);
      if (!normalized.ok) {
        setStatus("idle");
        setError(normalized.error);
        return;
      }

      setWarning(normalized.warning);
      const urlChanged = normalized.value !== current.baseUrl;

      if (urlChanged) {
        setStatus("testing");
        setError(null);
        try {
          await performTest(normalized.value);
        } catch (cause) {
          setStatus("idle");
          setError(cause instanceof Error ? cause.message : "Bridge test failed.");
          return;
        }
      }

      const next = editWebBridgeTarget(currentSettings, id, {
        ...draft,
        baseUrl: normalized.value,
        nowMs: Date.now(),
      });
      const loaded: LoadedWebBridgeSettings = {
        ...next,
        seedBridgeUrl: currentSettings.seedBridgeUrl,
      };
      persistSettings(loaded);
      updateSettings(loaded);
      if (urlChanged && current.id === activeBridge?.id) {
        pendingReloadRef.current = true;
        setStatus("switching");
      } else {
        setStatus("idle");
      }
    },
    [activeBridge?.id, performTest, updateSettings],
  );

  const switchBridge = useCallback(
    async (id: string) => {
      const currentSettings = settingsRef.current;
      const target = currentSettings.bridges.find((bridge) => bridge.id === id);
      if (!target) {
        setError("Bridge not found.");
        return;
      }

      setStatus("testing");
      setError(null);
      setWarning(normalizeWarning(target.baseUrl));

      try {
        await performTest(target.baseUrl);
      } catch (cause) {
        setStatus("idle");
        setError(cause instanceof Error ? cause.message : "Bridge test failed.");
        return;
      }

      const next = activateWebBridgeTarget(currentSettings, id, Date.now());
      const loaded: LoadedWebBridgeSettings = {
        ...next,
        seedBridgeUrl: currentSettings.seedBridgeUrl,
      };
      persistSettings(loaded);
      updateSettings(loaded);
      pendingReloadRef.current = true;
      setStatus("switching");
    },
    [performTest, updateSettings],
  );

  const deleteBridge = useCallback(
    async (id: string, replacementId?: string | null) => {
      const currentSettings = settingsRef.current;
      const target = currentSettings.bridges.find((bridge) => bridge.id === id);
      if (!target) {
        setError("Bridge not found.");
        return;
      }

      const replacement = resolveReplacementBridge(currentSettings, id, replacementId);
      if (currentSettings.activeBridgeId === id && !replacement) {
        setError("At least one Bridge must remain configured.");
        return;
      }

      setError(null);
      if (currentSettings.activeBridgeId === id && replacement) {
        setStatus("testing");
        setWarning(normalizeWarning(replacement.baseUrl));
        try {
          await performTest(replacement.baseUrl);
        } catch (cause) {
          setStatus("idle");
          setError(cause instanceof Error ? cause.message : "Bridge test failed.");
          return;
        }
      }

      const next = deleteWebBridgeTarget(currentSettings, id, replacementId ?? undefined);
      const loaded: LoadedWebBridgeSettings = {
        ...next,
        seedBridgeUrl: currentSettings.seedBridgeUrl,
      };
      persistSettings(loaded);
      updateSettings(loaded);
      if (currentSettings.activeBridgeId === id) {
        pendingReloadRef.current = true;
        setStatus("switching");
      } else {
        setStatus("idle");
      }
    },
    [performTest, updateSettings],
  );

  const value = useMemo<WebBridgeContextValue>(
    () => ({
      isWeb,
      setupRequired,
      seedBridgeUrl,
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
      clearError,
    }),
    [
      activeBridge,
      addBridge,
      clearError,
      deleteBridge,
      editBridge,
      error,
      isWeb,
      saveFirstBridge,
      seedBridgeUrl,
      setupRequired,
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
    throw new Error("useWebBridge must be used within a WebBridgeProvider.");
  }
  return value;
}
