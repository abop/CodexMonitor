// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalUsageSnapshot } from "../../../types";
import { localUsageSnapshot } from "../../../services/tauri";
import { useLocalUsage } from "./useLocalUsage";

vi.mock("../../../services/tauri", () => ({
  localUsageSnapshot: vi.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeSnapshot(updatedAt: number): LocalUsageSnapshot {
  return {
    updatedAt,
    days: [],
    totals: {
      last7DaysTokens: 0,
      last30DaysTokens: 0,
      averageDailyTokens: 0,
      cacheHitRatePercent: 0,
      peakDay: null,
      peakDayTokens: 0,
    },
    topModels: [],
  };
}

describe("useLocalUsage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not overlap polling requests and replays one queued refresh", async () => {
    const localUsageSnapshotMock = vi.mocked(localUsageSnapshot);
    const firstRequest = createDeferred<LocalUsageSnapshot>();
    const secondRequest = createDeferred<LocalUsageSnapshot>();
    localUsageSnapshotMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const { result, unmount } = renderHook(() =>
      useLocalUsage(true, "/tmp/codex"),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(localUsageSnapshotMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();
    });

    expect(localUsageSnapshotMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstRequest.resolve(makeSnapshot(1));
      await Promise.resolve();
    });

    expect(localUsageSnapshotMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondRequest.resolve(makeSnapshot(2));
      await Promise.resolve();
    });

    expect(result.current.snapshot?.updatedAt).toBe(2);

    unmount();
  });

  it("clears stale snapshot state when polling is disabled", async () => {
    const localUsageSnapshotMock = vi.mocked(localUsageSnapshot);
    localUsageSnapshotMock.mockResolvedValue(makeSnapshot(7));

    const { result, rerender } = renderHook(
      ({ enabled }) => useLocalUsage(enabled, "/tmp/codex"),
      {
        initialProps: { enabled: true },
      },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.snapshot?.updatedAt).toBe(7);

    rerender({ enabled: false });

    expect(result.current.snapshot).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
