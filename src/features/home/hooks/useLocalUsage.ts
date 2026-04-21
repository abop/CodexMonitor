import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalUsageSnapshot } from "../../../types";
import { localUsageSnapshot } from "../../../services/tauri";

type LocalUsageState = {
  snapshot: LocalUsageSnapshot | null;
  isLoading: boolean;
  error: string | null;
};

const emptyState: LocalUsageState = {
  snapshot: null,
  isLoading: false,
  error: null,
};

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function useLocalUsage(enabled: boolean, workspacePath: string | null) {
  const [state, setState] = useState<LocalUsageState>(emptyState);
  const requestIdRef = useRef(0);
  const enabledRef = useRef(enabled);
  const workspaceRef = useRef(workspacePath);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const pendingRefreshRef = useRef(false);

  useEffect(() => {
    enabledRef.current = enabled;
    requestIdRef.current += 1;
    inFlightRef.current = null;
    pendingRefreshRef.current = false;
    if (!enabled) {
      setState(emptyState);
    }
  }, [enabled]);

  useEffect(() => {
    workspaceRef.current = workspacePath;
    requestIdRef.current += 1;
    inFlightRef.current = null;
    pendingRefreshRef.current = false;
  }, [workspacePath]);

  const refresh = useCallback(() => {
    if (!enabledRef.current) {
      return Promise.resolve();
    }
    if (inFlightRef.current) {
      pendingRefreshRef.current = true;
      return inFlightRef.current;
    }
    let cyclePromise: Promise<void>;
    cyclePromise = (async () => {
      do {
        pendingRefreshRef.current = false;
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        try {
          const snapshot = await localUsageSnapshot(30, workspaceRef.current ?? undefined);
          if (requestIdRef.current !== requestId || !enabledRef.current) {
            continue;
          }
          setState({ snapshot, isLoading: false, error: null });
        } catch (err) {
          if (requestIdRef.current !== requestId || !enabledRef.current) {
            continue;
          }
          const message = err instanceof Error ? err.message : String(err);
          setState((prev) => ({ ...prev, isLoading: false, error: message }));
        }
      } while (pendingRefreshRef.current && enabledRef.current);
    })().finally(() => {
      if (inFlightRef.current === cyclePromise) {
        inFlightRef.current = null;
      }
    });
    inFlightRef.current = cyclePromise;
    return cyclePromise;
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    refresh()?.catch(() => {});
    const interval = window.setInterval(() => {
      refresh()?.catch(() => {});
    }, REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
    };
  }, [enabled, refresh, workspacePath]);

  return { ...state, refresh };
}
