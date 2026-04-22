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
  const inFlightWorkspaceIdRef = useRef<string | null>(null);
  const inFlightRequestRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (!activeWorkspace) {
      setState(emptyState);
      inFlightWorkspaceIdRef.current = null;
      inFlightRequestRef.current = null;
      return;
    }
    const workspaceId = activeWorkspace.id;
    if (
      inFlightWorkspaceIdRef.current === workspaceId &&
      inFlightRequestRef.current
    ) {
      return inFlightRequestRef.current;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    const request = getGitLog(workspaceId)
      .then((response) => {
        if (
          requestIdRef.current !== requestId ||
          workspaceIdRef.current !== workspaceId
        ) {
          return;
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
      })
      .catch((error) => {
        console.error("Failed to load git log", error);
        if (
          requestIdRef.current !== requestId ||
          workspaceIdRef.current !== workspaceId
        ) {
          return;
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
      })
      .finally(() => {
        if (
          inFlightWorkspaceIdRef.current === workspaceId &&
          inFlightRequestRef.current === request
        ) {
          inFlightWorkspaceIdRef.current = null;
          inFlightRequestRef.current = null;
        }
      });
    inFlightWorkspaceIdRef.current = workspaceId;
    inFlightRequestRef.current = request;
    return request;
  }, [activeWorkspace]);

  useEffect(() => {
    const workspaceId = activeWorkspace?.id ?? null;
    if (workspaceIdRef.current !== workspaceId) {
      workspaceIdRef.current = workspaceId;
      requestIdRef.current += 1;
      inFlightWorkspaceIdRef.current = null;
      inFlightRequestRef.current = null;
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
