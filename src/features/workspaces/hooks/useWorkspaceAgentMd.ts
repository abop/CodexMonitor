import { useCallback } from "react";
import type { DebugEntry, WorkspaceInfo } from "../../../types";
import { readAgentMd, writeAgentMd } from "../../../services/tauri";
import { useFileEditor, type FileEditorResponse } from "../../shared/hooks/useFileEditor";
import { isWebRuntime } from "@services/runtime";

type UseWorkspaceAgentMdOptions = {
  activeWorkspace: WorkspaceInfo | null;
  enabled?: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

export function useWorkspaceAgentMd({
  activeWorkspace,
  enabled = true,
  onDebug,
}: UseWorkspaceAgentMdOptions) {
  const workspaceId = activeWorkspace?.id ?? null;
  const webRuntime = isWebRuntime();
  const readEnabled = Boolean(workspaceId) && enabled;

  const readWithDebug = useCallback(async (): Promise<FileEditorResponse> => {
    if (!workspaceId || !enabled) {
      return { exists: false, content: "", truncated: false };
    }
    const requestWorkspaceId = workspaceId;
    onDebug?.({
      id: `${Date.now()}-client-agent-md-read`,
      timestamp: Date.now(),
      source: "client",
      label: "agents.md/read",
      payload: { workspaceId: requestWorkspaceId },
    });
    try {
      const response = await readAgentMd(requestWorkspaceId);
      onDebug?.({
        id: `${Date.now()}-server-agent-md-read`,
        timestamp: Date.now(),
        source: "server",
        label: "agents.md/read response",
        payload: response,
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onDebug?.({
        id: `${Date.now()}-client-agent-md-read-error`,
        timestamp: Date.now(),
        source: "error",
        label: "agents.md/read error",
        payload: message,
      });
      throw error;
    }
  }, [enabled, onDebug, workspaceId]);

  const writeWithDebug = useCallback(async (content: string) => {
    if (!workspaceId || !enabled || webRuntime) {
      return;
    }
    const requestWorkspaceId = workspaceId;
    onDebug?.({
      id: `${Date.now()}-client-agent-md-write`,
      timestamp: Date.now(),
      source: "client",
      label: "agents.md/write",
      payload: { workspaceId: requestWorkspaceId },
    });
    try {
      await writeAgentMd(requestWorkspaceId, content);
      onDebug?.({
        id: `${Date.now()}-server-agent-md-write`,
        timestamp: Date.now(),
        source: "server",
        label: "agents.md/write response",
        payload: { ok: true },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onDebug?.({
        id: `${Date.now()}-client-agent-md-write-error`,
        timestamp: Date.now(),
        source: "error",
        label: "agents.md/write error",
        payload: message,
      });
      throw error;
    }
  }, [enabled, onDebug, webRuntime, workspaceId]);

  return useFileEditor({
    key: readEnabled ? workspaceId : null,
    read: readWithDebug,
    write: writeWithDebug,
    readErrorTitle: "Couldn’t load AGENTS.md",
    writeErrorTitle: "Couldn’t save AGENTS.md",
  });
}
