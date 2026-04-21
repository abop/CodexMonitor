import { useEffect, useState } from "react";
import type { DebugEntry, WorkspaceInfo } from "../../../types";
import { useWorkspaceFiles } from "../../workspaces/hooks/useWorkspaceFiles";

type FilePanelMode = "git" | "files" | "prompts";
type TabKey = "home" | "projects" | "codex" | "git" | "log";
type TabletTabKey = "codex" | "git" | "log";

type UseWorkspaceFileListingArgs = {
  activeWorkspace: WorkspaceInfo | null;
  activeWorkspaceId: string | null;
  filePanelMode: FilePanelMode;
  isCompact: boolean;
  isTablet: boolean;
  activeTab: TabKey;
  tabletTab: TabletTabKey;
  rightPanelCollapsed: boolean;
  hasComposerSurface: boolean;
  runtimeFileTreeAvailable: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

type UseWorkspaceFileListingResult = {
  files: string[];
  isLoading: boolean;
  setFileAutocompleteActive: (active: boolean) => void;
};

export function useWorkspaceFileListing({
  activeWorkspace,
  activeWorkspaceId,
  filePanelMode,
  isCompact,
  isTablet,
  activeTab,
  tabletTab,
  rightPanelCollapsed,
  hasComposerSurface,
  runtimeFileTreeAvailable,
  onDebug,
}: UseWorkspaceFileListingArgs): UseWorkspaceFileListingResult {
  const [fileAutocompleteActive, setFileAutocompleteActive] = useState(false);

  const compactTab = isTablet ? tabletTab : activeTab;
  const filePanelVisible =
    filePanelMode === "files" &&
    (isCompact ? compactTab === "git" : !rightPanelCollapsed);
  const shouldFetchFiles =
    runtimeFileTreeAvailable &&
    Boolean(activeWorkspace) &&
    (filePanelMode === "files" || fileAutocompleteActive);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setFileAutocompleteActive(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!hasComposerSurface) {
      setFileAutocompleteActive(false);
    }
  }, [hasComposerSurface]);

  useEffect(() => {
    if (!runtimeFileTreeAvailable) {
      setFileAutocompleteActive(false);
    }
  }, [runtimeFileTreeAvailable]);

  const { files, isLoading } = useWorkspaceFiles({
    activeWorkspace,
    onDebug,
    enabled: shouldFetchFiles,
    pollingEnabled: runtimeFileTreeAvailable && filePanelVisible,
  });

  return {
    files: runtimeFileTreeAvailable ? files : [],
    isLoading: runtimeFileTreeAvailable ? isLoading : false,
    setFileAutocompleteActive,
  };
}
