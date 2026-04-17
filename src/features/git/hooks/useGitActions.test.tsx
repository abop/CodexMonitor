/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useGitActions } from "./useGitActions";

const askMock = vi.hoisted(() => vi.fn(async () => true));
const revertGitAllMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: askMock,
}));

vi.mock("../../../services/tauri", () => ({
  applyWorktreeChanges: vi.fn(async () => undefined),
  createGitHubRepo: vi.fn(async () => ({ ok: true })),
  initGitRepo: vi.fn(async () => ({ status: "initialized" })),
  revertGitAll: revertGitAllMock,
  revertGitFile: vi.fn(async () => undefined),
  stageGitAll: vi.fn(async () => undefined),
  stageGitFile: vi.fn(async () => undefined),
  unstageGitFile: vi.fn(async () => undefined),
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Repo",
  path: "/tmp/repo",
  connected: true,
  kind: "main",
  settings: {
    sidebarCollapsed: false,
  },
};

describe("useGitActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "desktop");
  });

  it("uses browser confirm for revert-all in web runtime", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);

    const onRefreshGitStatus = vi.fn();
    const onRefreshGitDiffs = vi.fn();
    const { result } = renderHook(() =>
      useGitActions({
        activeWorkspace: workspace,
        onRefreshGitStatus,
        onRefreshGitDiffs,
      }),
    );

    await act(async () => {
      await result.current.revertAllGitChanges();
    });

    expect(confirmMock).toHaveBeenCalledWith(
      expect.stringContaining("Revert all changes"),
    );
    expect(askMock).not.toHaveBeenCalled();
    expect(revertGitAllMock).toHaveBeenCalledWith("ws-1");
    expect(onRefreshGitStatus).toHaveBeenCalledTimes(1);
    expect(onRefreshGitDiffs).toHaveBeenCalledTimes(1);
  });

  it("does not revert when browser confirm is canceled", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(false);

    const { result } = renderHook(() =>
      useGitActions({
        activeWorkspace: workspace,
        onRefreshGitStatus: vi.fn(),
        onRefreshGitDiffs: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.revertAllGitChanges();
    });

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(askMock).not.toHaveBeenCalled();
    expect(revertGitAllMock).not.toHaveBeenCalled();
  });
});
