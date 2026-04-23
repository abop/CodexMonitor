// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitFileDiff, GitFileStatus, WorkspaceInfo } from "../../../types";
import { getGitDiffs } from "../../../services/tauri";
import { useGitDiffs } from "./useGitDiffs";

vi.mock("../../../services/tauri", () => ({
  getGitDiffs: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const changedFiles: GitFileStatus[] = [
  {
    path: "src/app.ts",
    status: "M",
    additions: 3,
    deletions: 1,
  },
];

const diffEntries: GitFileDiff[] = [
  {
    path: "src/app.ts",
    diff: "@@ -1 +1 @@",
    oldLines: ["before"],
    newLines: ["after"],
    isBinary: false,
    isImage: false,
    oldImageData: null,
    newImageData: null,
    oldImageMime: null,
    newImageMime: null,
  },
];

describe("useGitDiffs", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not request diffs when there are no changed files", async () => {
    const getGitDiffsMock = vi.mocked(getGitDiffs);

    const { result } = renderHook(
      ({
        active,
        files,
      }: {
        active: WorkspaceInfo | null;
        files: GitFileStatus[];
      }) => useGitDiffs(active, files, true, false),
      {
        initialProps: {
          active: workspace,
          files: [],
        },
      },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getGitDiffsMock).not.toHaveBeenCalled();
    expect(result.current.diffs).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("requests diffs when changed files are present", async () => {
    const getGitDiffsMock = vi.mocked(getGitDiffs);
    getGitDiffsMock.mockResolvedValueOnce(diffEntries);

    const { result } = renderHook(
      ({
        active,
        files,
      }: {
        active: WorkspaceInfo | null;
        files: GitFileStatus[];
      }) => useGitDiffs(active, files, true, false),
      {
        initialProps: {
          active: workspace,
          files: changedFiles,
        },
      },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getGitDiffsMock).toHaveBeenCalledWith("workspace-1");
    expect(result.current.diffs).toHaveLength(1);
    expect(result.current.diffs[0]?.path).toBe("src/app.ts");
  });
});
