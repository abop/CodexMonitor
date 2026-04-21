import { useCallback, useEffect, useRef, useState } from "react";
import type { GitLogEntry, WorkspaceInfo } from "../../../types";
import { getGitLog } from "../../../services/tauri";

type GitLogState = {
  entries: GitLogEntry[];
  total: number;
  ahead: number;
  behind: number;
  aheadEntries: GitLogEntry[];
  behindEntries: GitLogEntry[];
  upstream: string | null;
  isLoading: boolean;
  error: string | null;
};

const emptyState: GitLogState = {
  entries: [],
  total: 0,
  ahead: 0,
  behind: 0,
  aheadEntries: [],
  behindEntries: [],
  upstream: null,
  isLoading: false,
  error: null,
};

const REFRESH_INTERVAL_MS = 10000;

export function useGitLog(
  activeWorkspace: WorkspaceInfo | null,
  enabled: boolean,
) {
  const [state, setState] = useState<GitLogState>(emptyState);
  const requestIdRef = useRef(0);
  const workspaceIdRef = useRef<string | null>(activeWorkspace?.id ?? null);
  const enabledRef = useRef(enabled);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const pendingRefreshRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!activeWorkspace || !enabledRef.current) {
      setState(emptyState);
      return;
    }
    if (inFlightRef.current) {
      pendingRefreshRef.current = true;
      return inFlightRef.current;
    }
    const workspaceId = activeWorkspace.id;
    let cyclePromise: Promise<void>;
    cyclePromise = (async () => {
      do {
        pendingRefreshRef.current = false;
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        try {
          const response = await getGitLog(workspaceId);
          if (
            requestIdRef.current !== requestId ||
            workspaceIdRef.current !== workspaceId ||
            !enabledRef.current
          ) {
            continue;
          }
          setState({
            entries: response.entries,
            total: response.total,
            ahead: response.ahead,
            behind: response.behind,
            aheadEntries: response.aheadEntries,
            behindEntries: response.behindEntries,
            upstream: response.upstream,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          console.error("Failed to load git log", error);
          if (
            requestIdRef.current !== requestId ||
            workspaceIdRef.current !== workspaceId ||
            !enabledRef.current
          ) {
            continue;
          }
          setState({
            entries: [],
            total: 0,
            ahead: 0,
            behind: 0,
            aheadEntries: [],
            behindEntries: [],
            upstream: null,
            isLoading: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } while (
        pendingRefreshRef.current &&
        workspaceIdRef.current === workspaceId &&
        enabledRef.current
      );
    })().finally(() => {
      if (inFlightRef.current === cyclePromise) {
        inFlightRef.current = null;
      }
    });
    inFlightRef.current = cyclePromise;
    return cyclePromise;
  }, [activeWorkspace]);

  useEffect(() => {
    enabledRef.current = enabled;
    requestIdRef.current += 1;
    inFlightRef.current = null;
    pendingRefreshRef.current = false;
    if (!enabled) {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [enabled]);

  useEffect(() => {
    const workspaceId = activeWorkspace?.id ?? null;
    if (workspaceIdRef.current !== workspaceId) {
      workspaceIdRef.current = workspaceId;
      requestIdRef.current += 1;
      inFlightRef.current = null;
      pendingRefreshRef.current = false;
      setState(emptyState);
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (!enabled || !activeWorkspace) {
      return;
    }
    void refresh();
    const interval = window.setInterval(() => {
      refresh().catch(() => {});
    }, REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
    };
  }, [activeWorkspace, enabled, refresh]);

  return {
    entries: state.entries,
    total: state.total,
    ahead: state.ahead,
    behind: state.behind,
    aheadEntries: state.aheadEntries,
    behindEntries: state.behindEntries,
    upstream: state.upstream,
    isLoading: state.isLoading,
    error: state.error,
    refresh,
  };
}
