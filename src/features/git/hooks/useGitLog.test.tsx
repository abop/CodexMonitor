// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { getGitLog } from "../../../services/tauri";
import { useGitLog } from "./useGitLog";

vi.mock("../../../services/tauri", () => ({
  getGitLog: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const makeGitLogResponse = (branch = "origin/main") => ({
  entries: [],
  total: 0,
  ahead: 0,
  behind: 0,
  aheadEntries: [],
  behindEntries: [],
  upstream: branch,
});

describe("useGitLog", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not start another poll while the current git log request is still in flight", async () => {
    const getGitLogMock = vi.mocked(getGitLog);
    let resolveFirst:
      | ((value: ReturnType<typeof makeGitLogResponse>) => void)
      | undefined;
    const firstPromise = new Promise<ReturnType<typeof makeGitLogResponse>>((resolve) => {
      resolveFirst = resolve;
    });
    getGitLogMock
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(makeGitLogResponse("origin/next"));

    const { result, unmount } = renderHook(
      ({ active, enabled }: { active: WorkspaceInfo | null; enabled: boolean }) =>
        useGitLog(active, enabled),
      { initialProps: { active: workspace, enabled: true } },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getGitLogMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    expect(getGitLogMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst?.(makeGitLogResponse("origin/main"));
      await Promise.resolve();
    });

    expect(result.current.upstream).toBe("origin/main");

    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    expect(getGitLogMock).toHaveBeenCalledTimes(2);
    expect(result.current.upstream).toBe("origin/next");

    unmount();
  });
});
