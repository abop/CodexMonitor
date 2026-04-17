import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readRuntimeConfig,
  resetRuntimeBridgeBaseUrlForTests,
  setRuntimeBridgeBaseUrl,
  subscribeRuntimeBridgeBaseUrl,
} from "./runtime";

describe("runtime bridge URL", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetRuntimeBridgeBaseUrlForTests();
  });

  it("uses the saved runtime bridge before build-time env", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://env.example.com");

    setRuntimeBridgeBaseUrl("https://saved.example.com/");

    expect(readRuntimeConfig()).toMatchObject({
      runtime: "web",
      bridgeBaseUrl: "https://saved.example.com",
    });
  });

  it("notifies listeners when the runtime bridge changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRuntimeBridgeBaseUrl(listener);

    setRuntimeBridgeBaseUrl("https://saved.example.com");

    expect(listener).toHaveBeenCalledWith("https://saved.example.com");
    unsubscribe();
    setRuntimeBridgeBaseUrl("https://next.example.com");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
