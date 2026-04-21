/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceInsightsOrchestration } from "./useWorkspaceOrchestration";
import { useLocalUsage } from "@/features/home/hooks/useLocalUsage";

vi.mock("@/features/home/hooks/useLocalUsage", () => ({
  useLocalUsage: vi.fn(() => ({
    snapshot: null,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

function makeOptions(overrides?: Partial<Parameters<typeof useWorkspaceInsightsOrchestration>[0]>) {
  return {
    workspaces: [],
    workspacesById: new Map(),
    hasLoaded: true,
    showHome: true,
    usageSnapshotEnabled: false,
    threadsByWorkspace: {},
    lastAgentMessageByThread: {},
    threadStatusById: {},
    threadListLoadingByWorkspace: {},
    getWorkspaceGroupName: () => null,
    ...overrides,
  } as Parameters<typeof useWorkspaceInsightsOrchestration>[0] & {
    usageSnapshotEnabled: boolean;
  };
}

describe("useWorkspaceInsightsOrchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables local usage polling when the runtime capability is unavailable", () => {
    const { result } = renderHook(() =>
      useWorkspaceInsightsOrchestration(makeOptions()),
    );

    expect(vi.mocked(useLocalUsage)).toHaveBeenCalledWith(false, null);
    expect(result.current.usageSnapshotAvailable).toBe(false);
  });
});
