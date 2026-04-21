// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitLogResponse, WorkspaceInfo } from "../../../types";
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeLogResponse(summary: string): GitLogResponse {
  return {
    total: 1,
    entries: [
      {
        sha: `sha-${summary}`,
        summary,
        author: "Codex",
        timestamp: 1,
      },
    ],
    ahead: 0,
    behind: 0,
    aheadEntries: [],
    behindEntries: [],
    upstream: "origin/main",
  };
}

describe("useGitLog", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not overlap polling requests and replays one queued refresh", async () => {
    const getGitLogMock = vi.mocked(getGitLog);
    const firstRequest = createDeferred<GitLogResponse>();
    const secondRequest = createDeferred<GitLogResponse>();
    getGitLogMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

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
      firstRequest.resolve(makeLogResponse("main"));
      await Promise.resolve();
    });

    expect(getGitLogMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondRequest.resolve(makeLogResponse("queued"));
      await Promise.resolve();
    });

    expect(result.current.entries[0]?.summary).toBe("queued");

    unmount();
  });
});
