/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorktreeSetupStatusMap } from "./useWorktreeSetupStatusMap";
import { getWorktreeSetupStatus } from "@/services/tauri";
import type { WorkspaceInfo } from "@/types";

vi.mock("@/services/tauri", () => ({
  getWorktreeSetupStatus: vi.fn(),
}));

const getWorktreeSetupStatusMock = vi.mocked(getWorktreeSetupStatus);

function workspace(overrides: Partial<WorkspaceInfo>): WorkspaceInfo {
  return {
    id: overrides.id ?? "ws-1",
    name: overrides.name ?? "Workspace",
    path: overrides.path ?? "/tmp/workspace",
    connected: overrides.connected ?? true,
    kind: overrides.kind ?? "main",
    parentId: overrides.parentId ?? null,
    worktree: overrides.worktree ?? null,
    settings: {
      sidebarCollapsed: false,
      worktreeSetupScript: overrides.settings?.worktreeSetupScript ?? null,
      worktreesFolder: overrides.settings?.worktreesFolder ?? null,
    },
  };
}

describe("useWorktreeSetupStatusMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads setup states for worktree workspaces only", async () => {
    getWorktreeSetupStatusMock
      .mockResolvedValueOnce({
        shouldRun: true,
        script: "pnpm install",
      })
      .mockResolvedValueOnce({
        shouldRun: false,
        script: "pnpm install",
      });

    const { result } = renderHook(() =>
      useWorktreeSetupStatusMap({
        enabled: true,
        workspaces: [
          workspace({ id: "ws-main" }),
          workspace({
            id: "wt-1",
            kind: "worktree",
            worktree: { branch: "feat/one" },
            settings: { sidebarCollapsed: false, worktreeSetupScript: "pnpm install" },
          }),
          workspace({
            id: "wt-2",
            kind: "worktree",
            worktree: { branch: "feat/two" },
            settings: { sidebarCollapsed: false, worktreeSetupScript: "pnpm install" },
          }),
        ],
      }),
    );

    await waitFor(() => {
      expect(getWorktreeSetupStatusMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(result.current.worktreeSetupStateByWorkspaceId).toEqual({
        "wt-1": "pending",
        "wt-2": "launched",
      });
    });

    expect(getWorktreeSetupStatusMock).toHaveBeenNthCalledWith(1, "wt-1");
    expect(getWorktreeSetupStatusMock).toHaveBeenNthCalledWith(2, "wt-2");
  });

  it("clears cached setup states when capability is disabled", async () => {
    getWorktreeSetupStatusMock.mockResolvedValue({
      shouldRun: true,
      script: "pnpm install",
    });

    const workspaces = [
      workspace({
        id: "wt-1",
        kind: "worktree",
        worktree: { branch: "feat/one" },
        settings: { sidebarCollapsed: false, worktreeSetupScript: "pnpm install" },
      }),
    ];
    const { result, rerender } = renderHook(
      ({ enabled }) => useWorktreeSetupStatusMap({ enabled, workspaces }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => {
      expect(result.current.worktreeSetupStateByWorkspaceId).toEqual({
        "wt-1": "pending",
      });
    });

    rerender({ enabled: false });

    await waitFor(() => {
      expect(result.current.worktreeSetupStateByWorkspaceId).toEqual({});
    });
  });

  it("refreshes the setup state map on demand", async () => {
    getWorktreeSetupStatusMock
      .mockResolvedValueOnce({
        shouldRun: true,
        script: "pnpm install",
      })
      .mockResolvedValueOnce({
        shouldRun: false,
        script: "pnpm install",
      });

    const { result } = renderHook(() =>
      useWorktreeSetupStatusMap({
        enabled: true,
        workspaces: [
          workspace({
            id: "wt-1",
            kind: "worktree",
            worktree: { branch: "feat/one" },
            settings: { sidebarCollapsed: false, worktreeSetupScript: "pnpm install" },
          }),
        ],
      }),
    );

    await waitFor(() => {
      expect(result.current.worktreeSetupStateByWorkspaceId).toEqual({
        "wt-1": "pending",
      });
    });

    await act(async () => {
      result.current.refreshWorktreeSetupStatuses();
    });

    await waitFor(() => {
      expect(result.current.worktreeSetupStateByWorkspaceId).toEqual({
        "wt-1": "launched",
      });
    });
  });
});
