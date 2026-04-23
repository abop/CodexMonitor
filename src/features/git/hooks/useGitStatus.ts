import { useCallback, useEffect, useRef, useState } from "react";
import type { GitFileStatus, WorkspaceInfo } from "../../../types";
import { getGitStatus } from "../../../services/tauri";

type GitStatusState = {
  branchName: string;
  files: GitFileStatus[];
  stagedFiles: GitFileStatus[];
  unstagedFiles: GitFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
  error: string | null;
};

const emptyStatus: GitStatusState = {
  branchName: "",
  files: [],
  stagedFiles: [],
  unstagedFiles: [],
  totalAdditions: 0,
  totalDeletions: 0,
  error: null,
};

const REFRESH_INTERVAL_MS = 3000;
export function useGitStatus(activeWorkspace: WorkspaceInfo | null) {
  const [status, setStatus] = useState<GitStatusState>(emptyStatus);
  const requestIdRef = useRef(0);
  const workspaceIdRef = useRef<string | null>(activeWorkspace?.id ?? null);
  const cachedStatusRef = useRef<Map<string, GitStatusState>>(new Map());
  const inFlightWorkspaceIdRef = useRef<string | null>(null);
  const inFlightRequestRef = useRef<Promise<void> | null>(null);
  const workspaceId = activeWorkspace?.id ?? null;

  const resolveBranchName = useCallback(
    (incoming: string | undefined, cached: GitStatusState | undefined) => {
      const trimmed = incoming?.trim();
      if (trimmed && trimmed !== "unknown") {
        return trimmed;
      }
      const cachedBranch = cached?.branchName?.trim();
      return cachedBranch && cachedBranch !== "unknown"
        ? cachedBranch
        : trimmed ?? "";
    },
    [],
  );

  const refresh = useCallback(() => {
    if (!workspaceId) {
      setStatus(emptyStatus);
      inFlightWorkspaceIdRef.current = null;
      inFlightRequestRef.current = null;
      return Promise.resolve();
    }
    if (
      inFlightWorkspaceIdRef.current === workspaceId &&
      inFlightRequestRef.current
    ) {
      return inFlightRequestRef.current;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const request = getGitStatus(workspaceId)
      .then((data) => {
        if (
          requestIdRef.current !== requestId ||
          workspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        const cached = cachedStatusRef.current.get(workspaceId);
        const resolvedBranchName = resolveBranchName(data.branchName, cached);
        const nextStatus = {
          ...data,
          branchName: resolvedBranchName,
          error: null,
        };
        setStatus(nextStatus);
        cachedStatusRef.current.set(workspaceId, nextStatus);
      })
      .catch((err) => {
        console.error("Failed to load git status", err);
        if (
          requestIdRef.current !== requestId ||
          workspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        const cached = cachedStatusRef.current.get(workspaceId);
        const nextStatus = cached
          ? { ...cached, error: message }
          : { ...emptyStatus, branchName: "unknown", error: message };
        setStatus(nextStatus);
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
  }, [resolveBranchName, workspaceId]);

  useEffect(() => {
    if (workspaceIdRef.current !== workspaceId) {
      workspaceIdRef.current = workspaceId;
      requestIdRef.current += 1;
      inFlightWorkspaceIdRef.current = null;
      inFlightRequestRef.current = null;
      if (!workspaceId) {
        setStatus(emptyStatus);
        return;
      }
      const cached = cachedStatusRef.current.get(workspaceId);
      setStatus(cached ?? emptyStatus);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      setStatus(emptyStatus);
      return;
    }

    const fetchStatus = () => {
      refresh()?.catch(() => {});
    };

    fetchStatus();
    const interval = window.setInterval(fetchStatus, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [refresh, workspaceId]);

  return { status, refresh };
}
