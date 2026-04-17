import { useCallback } from "react";
import { useWorkspaces } from "../../workspaces/hooks/useWorkspaces";
import type { AppSettings, WorkspaceInfo } from "../../../types";
import type { DebugEntry } from "../../../types";
import { useWorkspaceDialogs } from "./useWorkspaceDialogs";
import { isMobilePlatform } from "../../../utils/platformPaths";
import { isWebRuntime } from "@services/runtime";
import type { AddWorkspacesFromPathsResult } from "../../workspaces/hooks/useWorkspaceCrud";

type WorkspaceControllerOptions = {
  appSettings: AppSettings;
  addDebugEntry: (entry: DebugEntry) => void;
  queueSaveSettings: (next: AppSettings) => Promise<AppSettings>;
};

export function useWorkspaceController({
  appSettings,
  addDebugEntry,
  queueSaveSettings,
}: WorkspaceControllerOptions) {
  const workspaceCore = useWorkspaces({
    onDebug: addDebugEntry,
    appSettings,
    onUpdateAppSettings: queueSaveSettings,
  });

  const {
    workspaces,
    addWorkspaceFromPath,
    addWorkspacesFromPaths: addWorkspacesFromPathsCore,
    removeWorkspace: removeWorkspaceCore,
    removeWorktree: removeWorktreeCore,
  } = workspaceCore;

  const {
    requestWorkspacePaths,
    mobileRemoteWorkspacePathPrompt,
    updateMobileRemoteWorkspacePathInput,
    cancelMobileRemoteWorkspacePathPrompt,
    submitMobileRemoteWorkspacePathPrompt,
    appendMobileRemoteWorkspacePathFromRecent,
    rememberRecentMobileRemoteWorkspacePaths,
    showAddWorkspacesResult,
    confirmWorkspaceRemoval,
    confirmWorktreeRemoval,
    showWorkspaceRemovalError,
    showWorktreeRemovalError,
  } = useWorkspaceDialogs();

  const runAddWorkspacesFromPaths = useCallback(
    async (
      paths: string[],
      options?: { rememberRemotePathRecents?: boolean },
    ) => {
      let result: AddWorkspacesFromPathsResult;
      if (isWebRuntime()) {
        const existingPaths = new Set(workspaces.map((entry) => entry.path.trim()));
        const seenSelections = new Set<string>();
        const added: WorkspaceInfo[] = [];
        const skippedExisting: string[] = [];
        const failures: AddWorkspacesFromPathsResult["failures"] = [];

        for (const selection of paths.map((path) => path.trim()).filter(Boolean)) {
          if (seenSelections.has(selection)) {
            continue;
          }
          seenSelections.add(selection);
          if (existingPaths.has(selection)) {
            skippedExisting.push(selection);
            continue;
          }
          try {
            const workspace = await addWorkspaceFromPath(selection, {
              activate: added.length === 0,
            });
            if (workspace) {
              added.push(workspace);
              existingPaths.add(workspace.path.trim());
            }
          } catch (error) {
            failures.push({
              path: selection,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        result = {
          added,
          firstAdded: added[0] ?? null,
          skippedExisting,
          skippedInvalid: [],
          failures,
        };
      } else {
        result = await addWorkspacesFromPathsCore(paths);
      }
      await showAddWorkspacesResult(result);
      if (options?.rememberRemotePathRecents && result.added.length > 0) {
        rememberRecentMobileRemoteWorkspacePaths(result.added.map((entry) => entry.path));
      }
      return result;
    },
    [
      addWorkspaceFromPath,
      addWorkspacesFromPathsCore,
      rememberRecentMobileRemoteWorkspacePaths,
      showAddWorkspacesResult,
      workspaces,
    ],
  );

  const addWorkspacesFromPaths = useCallback(
    async (paths: string[]): Promise<WorkspaceInfo | null> => {
      const result = await runAddWorkspacesFromPaths(paths);
      return result.firstAdded;
    },
    [runAddWorkspacesFromPaths],
  );

  const addWorkspace = useCallback(async (): Promise<WorkspaceInfo | null> => {
    const paths = await requestWorkspacePaths(appSettings.backendMode);
    if (paths.length === 0) {
      return null;
    }
    const result = await runAddWorkspacesFromPaths(paths, {
      rememberRemotePathRecents:
        isWebRuntime() || (isMobilePlatform() && appSettings.backendMode === "remote"),
    });
    return result.firstAdded;
  }, [appSettings.backendMode, requestWorkspacePaths, runAddWorkspacesFromPaths]);

  const removeWorkspace = useCallback(
    async (workspaceId: string) => {
      const confirmed = await confirmWorkspaceRemoval(workspaces, workspaceId);
      if (!confirmed) {
        return;
      }
      try {
        await removeWorkspaceCore(workspaceId);
      } catch (error) {
        await showWorkspaceRemovalError(error);
      }
    },
    [confirmWorkspaceRemoval, removeWorkspaceCore, showWorkspaceRemovalError, workspaces],
  );

  const removeWorktree = useCallback(
    async (workspaceId: string) => {
      const confirmed = await confirmWorktreeRemoval(workspaces, workspaceId);
      if (!confirmed) {
        return;
      }
      try {
        await removeWorktreeCore(workspaceId);
      } catch (error) {
        await showWorktreeRemovalError(error);
      }
    },
    [confirmWorktreeRemoval, removeWorktreeCore, showWorktreeRemovalError, workspaces],
  );

  return {
    ...workspaceCore,
    addWorkspace,
    addWorkspacesFromPaths,
    mobileRemoteWorkspacePathPrompt,
    updateMobileRemoteWorkspacePathInput,
    cancelMobileRemoteWorkspacePathPrompt,
    submitMobileRemoteWorkspacePathPrompt,
    appendMobileRemoteWorkspacePathFromRecent,
    removeWorkspace,
    removeWorktree,
  };
}
