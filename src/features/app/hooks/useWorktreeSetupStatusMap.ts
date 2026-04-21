import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getWorktreeSetupStatus } from "@/services/tauri";
import type { WorkspaceInfo } from "@/types";

export type WorktreeSetupStateLabel = "pending" | "launched";

type UseWorktreeSetupStatusMapOptions = {
  workspaces: WorkspaceInfo[];
  enabled: boolean;
};

type WorktreeSetupStateMap = Record<string, WorktreeSetupStateLabel | undefined>;

function normalizeStatusLabel(
  script: string | null | undefined,
  shouldRun: boolean,
): WorktreeSetupStateLabel | null {
  if (!script?.trim()) {
    return null;
  }
  return shouldRun ? "pending" : "launched";
}

export function useWorktreeSetupStatusMap({
  workspaces,
  enabled,
}: UseWorktreeSetupStatusMapOptions) {
  const [refreshToken, setRefreshToken] = useState(0);
  const lastRequestKeyRef = useRef<string | null>(null);
  const [worktreeSetupStateByWorkspaceId, setWorktreeSetupStateByWorkspaceId] =
    useState<WorktreeSetupStateMap>({});

  const worktreeEntries = useMemo(
    () => workspaces.filter((workspace) => (workspace.kind ?? "main") === "worktree"),
    [workspaces],
  );
  const worktreeKey = useMemo(
    () =>
      worktreeEntries
        .map(
          (workspace) =>
            `${workspace.id}:${workspace.settings.worktreeSetupScript ?? ""}:${workspace.path}`,
        )
        .join("\u0000"),
    [worktreeEntries],
  );

  const refreshWorktreeSetupStatuses = useCallback(() => {
    setRefreshToken((current) => current + 1);
  }, []);

  useEffect(() => {
    const requestKey = `${enabled ? "1" : "0"}:${refreshToken}:${worktreeKey}`;
    if (lastRequestKeyRef.current === requestKey) {
      return;
    }
    lastRequestKeyRef.current = requestKey;

    if (!enabled || worktreeEntries.length === 0) {
      setWorktreeSetupStateByWorkspaceId({});
      return;
    }

    let cancelled = false;

    void Promise.all(
      worktreeEntries.map(async (workspace) => {
        try {
          const status = await getWorktreeSetupStatus(workspace.id);
          return [workspace.id, status] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        return;
      }

      const nextState: WorktreeSetupStateMap = {};
      entries.forEach((entry) => {
        if (!entry) {
          return;
        }
        const [workspaceId, status] = entry;
        const label = normalizeStatusLabel(status.script, status.shouldRun);
        if (label) {
          nextState[workspaceId] = label;
        }
      });
      setWorktreeSetupStateByWorkspaceId(nextState);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, refreshToken, worktreeEntries, worktreeKey]);

  return {
    worktreeSetupStateByWorkspaceId,
    refreshWorktreeSetupStatuses,
  };
}
