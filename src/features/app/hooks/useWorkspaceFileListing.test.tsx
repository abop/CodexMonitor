/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceFileListing } from "./useWorkspaceFileListing";

const useWorkspaceFilesMock = vi.hoisted(() =>
  vi.fn(() => ({
    files: ["src/main.ts"],
    isLoading: true,
    refreshFiles: vi.fn(),
  })),
);

vi.mock("../../workspaces/hooks/useWorkspaceFiles", () => ({
  useWorkspaceFiles: useWorkspaceFilesMock,
}));

const activeWorkspace = {
  id: "ws-1",
  name: "Workspace",
  path: "/tmp/workspace",
  connected: true,
  kind: "main" as const,
  settings: { sidebarCollapsed: false },
};

describe("useWorkspaceFileListing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides cached files when runtime file capability is unavailable", () => {
    const { result } = renderHook(() =>
      useWorkspaceFileListing({
        activeWorkspace,
        activeWorkspaceId: "ws-1",
        filePanelMode: "files",
        isCompact: false,
        isTablet: false,
        activeTab: "git",
        tabletTab: "git",
        rightPanelCollapsed: false,
        hasComposerSurface: true,
        runtimeFileTreeAvailable: false,
      }),
    );

    expect(result.current.files).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
