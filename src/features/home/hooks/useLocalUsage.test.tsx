// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localUsageSnapshot } from "../../../services/tauri";
import { useLocalUsage } from "./useLocalUsage";

vi.mock("../../../services/tauri", () => ({
  localUsageSnapshot: vi.fn(),
}));

const makeSnapshot = () => ({
  updatedAt: Date.now(),
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
});

describe("useLocalUsage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not start another poll while the current usage request is still in flight", async () => {
    const localUsageSnapshotMock = vi.mocked(localUsageSnapshot);
    let resolveFirst:
      | ((value: ReturnType<typeof makeSnapshot>) => void)
      | undefined;
    const firstPromise = new Promise<ReturnType<typeof makeSnapshot>>((resolve) => {
      resolveFirst = resolve;
    });
    localUsageSnapshotMock
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(makeSnapshot());

    const { result, unmount } = renderHook(
      ({ enabled, workspacePath }: { enabled: boolean; workspacePath: string | null }) =>
        useLocalUsage(enabled, workspacePath),
      { initialProps: { enabled: true, workspacePath: "/tmp/codex" } },
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
      resolveFirst?.(makeSnapshot());
      await Promise.resolve();
    });

    expect(result.current.snapshot).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();
    });

    expect(localUsageSnapshotMock).toHaveBeenCalledTimes(2);

    unmount();
  });
});
