// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as eventsService from "@services/events";
import * as runtimeService from "@services/runtime";
import { WebBridgeProvider, useWebBridge } from "./WebBridgeProvider";
import { WEB_BRIDGE_STORAGE_KEY } from "./webBridgeStorage";

describe("WebBridgeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    runtimeService.resetRuntimeBridgeBaseUrlForTests();
  });

  function wrapper(options: {
    testConnection?: (baseUrl: string) => Promise<void>;
    reloadApp?: () => void;
  } = {}) {
    return ({ children }: { children: ReactNode }) => (
      <WebBridgeProvider
        testConnection={options.testConnection ?? vi.fn().mockResolvedValue(undefined)}
        reloadApp={options.reloadApp ?? vi.fn()}
      >
        {children}
      </WebBridgeProvider>
    );
  }

  it("requires setup when web runtime has no saved bridge", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    const { result } = renderHook(() => useWebBridge(), { wrapper: wrapper() });

    expect(result.current.setupRequired).toBe(true);
    expect(result.current.activeBridge).toBeNull();
  });

  it("does not require setup on desktop runtime", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "desktop");

    const { result } = renderHook(() => useWebBridge(), { wrapper: wrapper() });

    expect(result.current.setupRequired).toBe(false);
  });

  it("pre-fills from build-time bridge URL without saving it", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://seed.example.com/");

    const { result } = renderHook(() => useWebBridge(), { wrapper: wrapper() });

    expect(result.current.seedBridgeUrl).toBe("https://seed.example.com");
    expect(localStorage.getItem(WEB_BRIDGE_STORAGE_KEY)).toBeNull();
  });

  it("exposes a warning for a seeded plain-http bridge url", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "http://bridge.example.com");

    const { result } = renderHook(() => useWebBridge(), { wrapper: wrapper() });

    expect(result.current.seedBridgeUrl).toBe("http://bridge.example.com");
    expect(result.current.warning).toBe(
      "Plain HTTP should only be used for trusted development hosts.",
    );
  });

  it("saves first bridge after a successful test", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    const testConnection = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useWebBridge(), {
      wrapper: wrapper({ testConnection }),
    });

    await act(async () => {
      await result.current.saveFirstBridge({
        name: "dev",
        baseUrl: "https://dev.example.com/",
      });
    });

    expect(testConnection).toHaveBeenCalledWith("https://dev.example.com");
    expect(result.current.setupRequired).toBe(false);
    expect(result.current.activeBridge?.name).toBe("dev");
    expect(runtimeService.readRuntimeConfig().bridgeBaseUrl).toBe(
      "https://dev.example.com",
    );
  });

  it("keeps setup open when the first bridge test fails", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    const testConnection = vi.fn().mockRejectedValue(new Error("no route"));

    const { result } = renderHook(() => useWebBridge(), {
      wrapper: wrapper({ testConnection }),
    });

    await act(async () => {
      await result.current.saveFirstBridge({
        name: "dev",
        baseUrl: "https://dev.example.com",
      });
    });

    expect(result.current.setupRequired).toBe(true);
    expect(result.current.error).toBe("no route");
    expect(result.current.activeBridge).toBeNull();
  });

  it("tests before switching and reloads after success", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    const reloadApp = vi.fn();
    const testConnection = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useWebBridge(), {
      wrapper: wrapper({ testConnection, reloadApp }),
    });

    await act(async () => {
      await result.current.saveFirstBridge({
        name: "dev",
        baseUrl: "https://dev.example.com",
      });
      await result.current.addBridge({
        name: "build",
        baseUrl: "https://build.example.com",
        activate: false,
      });
    });
    const build = result.current.bridges.find((bridge) => bridge.name === "build");
    if (!build) {
      throw new Error("Expected build bridge");
    }

    await act(async () => {
      await result.current.switchBridge(build.id);
    });

    expect(runtimeService.readRuntimeConfig().bridgeBaseUrl).toBe(
      "https://build.example.com",
    );
    expect(reloadApp).toHaveBeenCalledTimes(1);
  });

  it("does not switch or reload when switch test fails", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    const reloadApp = vi.fn();
    const runtimeBridgeListener = vi.fn();
    const runtimeBridgeUrlSpy = vi.spyOn(
      runtimeService,
      "setRuntimeBridgeBaseUrl",
    );
    const resetBridgeRealtimeClientSpy = vi.spyOn(
      eventsService,
      "resetBridgeRealtimeClient",
    );
    const testConnection = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useWebBridge(), {
      wrapper: wrapper({ testConnection, reloadApp }),
    });

    await act(async () => {
      await result.current.saveFirstBridge({
        name: "dev",
        baseUrl: "https://dev.example.com",
      });
      await result.current.addBridge({
        name: "build",
        baseUrl: "https://build.example.com",
        activate: false,
      });
    });
    const build = result.current.bridges.find((bridge) => bridge.name === "build");
    if (!build) {
      throw new Error("Expected build bridge");
    }

    const unsubscribe = runtimeService.subscribeRuntimeBridgeBaseUrl(
      runtimeBridgeListener,
    );
    runtimeBridgeUrlSpy.mockClear();
    resetBridgeRealtimeClientSpy.mockClear();
    await act(async () => {
      await result.current.switchBridge(build.id);
    });
    unsubscribe();

    expect(result.current.activeBridge?.name).toBe("dev");
    expect(result.current.error).toBe("offline");
    expect(reloadApp).not.toHaveBeenCalled();
    expect(runtimeBridgeListener).not.toHaveBeenCalled();
    expect(runtimeBridgeUrlSpy).not.toHaveBeenCalled();
    expect(resetBridgeRealtimeClientSpy).not.toHaveBeenCalled();
  });
});
