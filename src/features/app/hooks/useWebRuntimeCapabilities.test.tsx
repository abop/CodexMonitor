/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWebRuntimeCapabilities } from "./useWebRuntimeCapabilities";
import { fetchBridgeCapabilities } from "@/services/bridge/http";

type MockRuntimeConfig = {
  runtime: "desktop" | "web";
  bridgeBaseUrl: string | null;
};

const mockRuntimeConfig: MockRuntimeConfig = {
  runtime: "desktop",
  bridgeBaseUrl: null,
};
const bridgeListeners = new Set<(baseUrl: string | null) => void>();
let subscribeImpl = (listener: (baseUrl: string | null) => void) => {
  bridgeListeners.add(listener);
  return () => {
    bridgeListeners.delete(listener);
  };
};

vi.mock("@/services/bridge/http", () => ({
  fetchBridgeCapabilities: vi.fn(),
}));

vi.mock("@/services/runtime", () => ({
  readRuntimeConfig: () => ({ ...mockRuntimeConfig }),
  subscribeRuntimeBridgeBaseUrl: (listener: (baseUrl: string | null) => void) =>
    subscribeImpl(listener),
}));

const fetchBridgeCapabilitiesMock = vi.mocked(fetchBridgeCapabilities);

function setMockRuntimeConfig(nextConfig: Partial<MockRuntimeConfig>) {
  Object.assign(mockRuntimeConfig, nextConfig);
}

function publishBridgeBaseUrl(baseUrl: string | null) {
  mockRuntimeConfig.bridgeBaseUrl = baseUrl;
  const listeners = Array.from(bridgeListeners);
  listeners.forEach((listener) => {
    listener(baseUrl);
  });
}

describe("useWebRuntimeCapabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockRuntimeConfig({
      runtime: "desktop",
      bridgeBaseUrl: null,
    });
    bridgeListeners.clear();
    subscribeImpl = (listener) => {
      bridgeListeners.add(listener);
      return () => {
        bridgeListeners.delete(listener);
      };
    };
  });

  it("returns desktop defaults without fetching", () => {
    setMockRuntimeConfig({ runtime: "desktop" });

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
    setMockRuntimeConfig({
      runtime: "web",
      bridgeBaseUrl: "https://bridge.example.com",
    });
    fetchBridgeCapabilitiesMock.mockResolvedValue({
      version: 1,
      methods: ["turn_steer"],
      threadControls: {
        steer: true,
        fork: true,
        compact: false,
        review: true,
        mcp: true,
      },
      files: {
        workspaceTree: false,
        workspaceAgents: false,
        globalAgents: false,
        globalConfig: false,
      },
      operations: {
        usageSnapshot: true,
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
        review: true,
        mcp: true,
      }),
    );

    expect(result.current.operations).toEqual({
      usageSnapshot: true,
      doctorReport: false,
      featureFlags: false,
    });
  });

  it("picks up a bridge URL published during subscription bootstrap", async () => {
    setMockRuntimeConfig({
      runtime: "web",
      bridgeBaseUrl: null,
    });
    subscribeImpl = (listener) => {
      mockRuntimeConfig.bridgeBaseUrl = "https://bridge.example.com";
      bridgeListeners.add(listener);
      return () => {
        bridgeListeners.delete(listener);
      };
    };
    fetchBridgeCapabilitiesMock.mockResolvedValue({
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

    const { result } = renderHook(() => useWebRuntimeCapabilities());

    await waitFor(() =>
      expect(fetchBridgeCapabilitiesMock).toHaveBeenCalledWith({
        baseUrl: "https://bridge.example.com",
      }),
    );

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

  it("resets to safe fallback when the bridge URL changes and ignores stale in-flight results", async () => {
    setMockRuntimeConfig({
      runtime: "web",
      bridgeBaseUrl: "https://bridge-one.example.com",
    });

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

    act(() => {
      publishBridgeBaseUrl("https://bridge-two.example.com");
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

    expect(result.current.threadControls).toEqual({
      steer: false,
      fork: false,
      compact: false,
      review: false,
      mcp: false,
    });

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
    setMockRuntimeConfig({
      runtime: "web",
      bridgeBaseUrl: "https://bridge.example.com",
    });
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
