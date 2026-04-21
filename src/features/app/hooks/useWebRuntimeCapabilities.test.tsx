/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWebRuntimeCapabilities } from "./useWebRuntimeCapabilities";
import {
  resetRuntimeBridgeBaseUrlForTests,
  setRuntimeBridgeBaseUrl,
} from "@/services/runtime";
import { fetchBridgeCapabilities } from "@/services/bridge/http";

vi.mock("@/services/bridge/http", () => ({
  fetchBridgeCapabilities: vi.fn(),
}));

const fetchBridgeCapabilitiesMock = vi.mocked(fetchBridgeCapabilities);

describe("useWebRuntimeCapabilities", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    resetRuntimeBridgeBaseUrlForTests();
  });

  it("returns desktop defaults without fetching", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "desktop");

    const { result } = renderHook(() => useWebRuntimeCapabilities());

    expect(result.current.threadControls).toEqual({
      steer: true,
      fork: true,
      compact: true,
      review: true,
      mcp: true,
    });
    expect(fetchBridgeCapabilitiesMock).not.toHaveBeenCalled();
  });

  it("fetches capabilities from the current bridge URL in web runtime", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    setRuntimeBridgeBaseUrl("https://bridge.example.com");
    fetchBridgeCapabilitiesMock.mockResolvedValue({
      version: 1,
      methods: ["turn_steer"],
      threadControls: {
        steer: true,
        fork: true,
        compact: false,
        review: false,
        mcp: false,
      },
      files: {
        workspaceTree: false,
        workspaceAgents: false,
        globalAgents: false,
        globalConfig: false,
      },
      operations: {
        usageSnapshot: false,
        doctorReport: false,
        featureFlags: false,
      },
    });

    const { result } = renderHook(() => useWebRuntimeCapabilities());

    await waitFor(() =>
      expect(fetchBridgeCapabilitiesMock).toHaveBeenCalledWith({
        baseUrl: "https://bridge.example.com",
      }),
    );

    await waitFor(() =>
      expect(result.current.threadControls).toEqual({
        steer: true,
        fork: true,
        compact: false,
        review: false,
        mcp: false,
      }),
    );
  });

  it("resets to safe fallback when the bridge URL changes", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    setRuntimeBridgeBaseUrl("https://bridge-one.example.com");

    let resolveFirst:
      | ((value: Awaited<ReturnType<typeof fetchBridgeCapabilities>>) => void)
      | null = null;
    let resolveSecond:
      | ((value: Awaited<ReturnType<typeof fetchBridgeCapabilities>>) => void)
      | null = null;

    fetchBridgeCapabilitiesMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const { result } = renderHook(() => useWebRuntimeCapabilities());

    await waitFor(() =>
      expect(fetchBridgeCapabilitiesMock).toHaveBeenCalledWith({
        baseUrl: "https://bridge-one.example.com",
      }),
    );

    await act(async () => {
      resolveFirst?.({
        version: 1,
        methods: ["turn_steer"],
        threadControls: {
          steer: true,
          fork: true,
          compact: true,
          review: false,
          mcp: false,
        },
        files: {
          workspaceTree: false,
          workspaceAgents: false,
          globalAgents: false,
          globalConfig: false,
        },
        operations: {
          usageSnapshot: false,
          doctorReport: false,
          featureFlags: false,
        },
      });
    });

    await waitFor(() =>
      expect(result.current.threadControls).toEqual({
        steer: true,
        fork: true,
        compact: true,
        review: false,
        mcp: false,
      }),
    );

    act(() => {
      setRuntimeBridgeBaseUrl("https://bridge-two.example.com");
    });

    expect(result.current.threadControls).toEqual({
      steer: false,
      fork: false,
      compact: false,
      review: false,
      mcp: false,
    });

    await waitFor(() =>
      expect(fetchBridgeCapabilitiesMock).toHaveBeenCalledWith({
        baseUrl: "https://bridge-two.example.com",
      }),
    );

    await act(async () => {
      resolveSecond?.({
        version: 1,
        methods: [],
        threadControls: {
          steer: true,
          fork: false,
          compact: false,
          review: false,
          mcp: false,
        },
        files: {
          workspaceTree: false,
          workspaceAgents: false,
          globalAgents: false,
          globalConfig: false,
        },
        operations: {
          usageSnapshot: false,
          doctorReport: false,
          featureFlags: false,
        },
      });
    });

    await waitFor(() =>
      expect(result.current.threadControls).toEqual({
        steer: true,
        fork: false,
        compact: false,
        review: false,
        mcp: false,
      }),
    );
  });

  it("keeps steer, fork, and compact false on fetch failure", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    setRuntimeBridgeBaseUrl("https://bridge.example.com");
    fetchBridgeCapabilitiesMock.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useWebRuntimeCapabilities());

    await waitFor(() =>
      expect(fetchBridgeCapabilitiesMock).toHaveBeenCalledWith({
        baseUrl: "https://bridge.example.com",
      }),
    );

    await waitFor(() =>
      expect(result.current.threadControls).toEqual({
        steer: false,
        fork: false,
        compact: false,
        review: false,
        mcp: false,
      }),
    );
  });
});
