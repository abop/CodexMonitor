import { useCallback, type MouseEvent } from "react";

import type { WorkspaceInfo } from "../../../types";
import {
  type RuntimeContextMenuItem,
  useRuntimeContextMenu,
} from "../../design-system/components/popover/useRuntimeContextMenu";
import { revealPathInFileManager } from "../../../services/openers";
import { pushErrorToast } from "../../../services/toasts";
import { fileManagerName } from "../../../utils/platformPaths";

type SidebarMenuHandlers = {
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onSyncThread: (workspaceId: string, threadId: string) => void;
  onPinThread: (workspaceId: string, threadId: string) => void;
  onUnpinThread: (workspaceId: string, threadId: string) => void;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  onRenameThread: (workspaceId: string, threadId: string) => void;
  onReloadWorkspaceThreads: (workspaceId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onDeleteWorktree: (workspaceId: string) => void;
};

export function useSidebarMenus({
  onDeleteThread,
  onSyncThread,
  onPinThread,
  onUnpinThread,
  isThreadPinned,
  onRenameThread,
  onReloadWorkspaceThreads,
  onDeleteWorkspace,
  onDeleteWorktree,
}: SidebarMenuHandlers) {
  const { showContextMenu, menuNode: sidebarContextMenu } =
    useRuntimeContextMenu({
      className: "sidebar-context-menu",
    });

  const showMenu = useCallback(
    async (event: MouseEvent, items: RuntimeContextMenuItem[]) => {
      await showContextMenu(event, items);
    },
    [showContextMenu],
  );

  const showThreadMenu = useCallback(
    async (
      event: MouseEvent,
      workspaceId: string,
      threadId: string,
      canPin: boolean,
    ) => {
      const items: RuntimeContextMenuItem[] = [
        {
          id: "rename",
          text: "Rename",
          action: () => onRenameThread(workspaceId, threadId),
        },
        {
          id: "sync",
          text: "Sync from server",
          action: () => onSyncThread(workspaceId, threadId),
        },
      ];
      if (canPin) {
        const isPinned = isThreadPinned(workspaceId, threadId);
        items.push({
          id: isPinned ? "unpin" : "pin",
          text: isPinned ? "Unpin" : "Pin",
          action: () => {
            if (isPinned) {
              onUnpinThread(workspaceId, threadId);
            } else {
              onPinThread(workspaceId, threadId);
            }
          },
        });
      }
      items.push(
        {
          id: "copy-id",
          text: "Copy ID",
          action: async () => {
            try {
              await navigator.clipboard.writeText(threadId);
            } catch {
              // Clipboard failures are non-fatal here.
            }
          },
        },
        {
          id: "archive",
          text: "Archive",
          action: () => onDeleteThread(workspaceId, threadId),
        },
      );
      await showMenu(event, items);
    },
    [
      isThreadPinned,
      onDeleteThread,
      onPinThread,
      onRenameThread,
      showMenu,
      onSyncThread,
      onUnpinThread,
    ],
  );

  const showWorkspaceMenu = useCallback(
    async (event: MouseEvent, workspaceId: string) => {
      await showMenu(event, [
        {
          id: "reload",
          text: "Reload threads",
          action: () => onReloadWorkspaceThreads(workspaceId),
        },
        {
          id: "delete",
          text: "Delete",
          action: () => onDeleteWorkspace(workspaceId),
        },
      ]);
    },
    [onReloadWorkspaceThreads, onDeleteWorkspace, showMenu],
  );

  const showWorktreeMenu = useCallback(
    async (event: MouseEvent, worktree: WorkspaceInfo) => {
      const fileManagerLabel = fileManagerName();
      await showMenu(event, [
        {
          id: "reload",
          text: "Reload threads",
          action: () => onReloadWorkspaceThreads(worktree.id),
        },
        {
          id: "show",
          text: `Show in ${fileManagerLabel}`,
          action: async () => {
            if (!worktree.path) {
              return;
            }
            try {
              await revealPathInFileManager(worktree.path);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              pushErrorToast({
                title: `Couldn't show worktree in ${fileManagerLabel}`,
                message,
              });
              console.warn("Failed to reveal worktree", {
                message,
                workspaceId: worktree.id,
                path: worktree.path,
              });
            }
          },
        },
        {
          id: "delete",
          text: "Delete worktree",
          action: () => onDeleteWorktree(worktree.id),
        },
      ]);
    },
    [onReloadWorkspaceThreads, onDeleteWorktree, showMenu],
  );

  const showCloneMenu = useCallback(
    async (event: MouseEvent, clone: WorkspaceInfo) => {
      const fileManagerLabel = fileManagerName();
      await showMenu(event, [
        {
          id: "reload",
          text: "Reload threads",
          action: () => onReloadWorkspaceThreads(clone.id),
        },
        {
          id: "show",
          text: `Show in ${fileManagerLabel}`,
          action: async () => {
            if (!clone.path) {
              return;
            }
            try {
              await revealPathInFileManager(clone.path);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              pushErrorToast({
                title: `Couldn't show clone in ${fileManagerLabel}`,
                message,
              });
              console.warn("Failed to reveal clone", {
                message,
                workspaceId: clone.id,
                path: clone.path,
              });
            }
          },
        },
        {
          id: "delete",
          text: "Delete clone",
          action: () => onDeleteWorkspace(clone.id),
        },
      ]);
    },
    [onReloadWorkspaceThreads, onDeleteWorkspace, showMenu],
  );

  return {
    showThreadMenu,
    showWorkspaceMenu,
    showWorktreeMenu,
    showCloneMenu,
    sidebarContextMenu,
  };
}
