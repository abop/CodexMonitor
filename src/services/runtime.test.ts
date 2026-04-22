import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isWebRuntime,
  readRuntimeConfig,
  resetRuntimeBackendBaseUrlForTests,
  resolveAppRuntime,
  setRuntimeBackendBaseUrl,
} from "./runtime";

describe("runtime config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetRuntimeBackendBaseUrlForTests();
  });

  it("defaults to web outside tauri", () => {
    expect(resolveAppRuntime({ runtimeEnv: undefined, hasTauri: false })).toBe("web");
  });

  it("uses explicit web runtime env", () => {
    expect(resolveAppRuntime({ runtimeEnv: "web", hasTauri: true })).toBe("web");
  });

  it("normalizes runtime backend url overrides", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    setRuntimeBackendBaseUrl("https://daemon.example.com/");

    expect(readRuntimeConfig()).toEqual({
      runtime: "web",
      backendBaseUrl: "https://daemon.example.com",
    });
    expect(isWebRuntime()).toBe(true);
  });
});
