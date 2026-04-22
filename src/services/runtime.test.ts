// @vitest-environment jsdom

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
    window.localStorage.clear();
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
      backendToken: null,
      activeBackend: {
        id: "runtime-override",
        name: "Current backend",
        baseUrl: "https://daemon.example.com",
        token: null,
      },
    });
    expect(isWebRuntime()).toBe(true);
  });

  it("reads the backend token from env when provided", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    vi.stubEnv("VITE_CODEXMONITOR_BACKEND_URL", "https://daemon.example.com/");
    vi.stubEnv("VITE_CODEXMONITOR_BACKEND_TOKEN", "secret-token");

    expect(readRuntimeConfig()).toMatchObject({
      runtime: "web",
      backendBaseUrl: "https://daemon.example.com",
      backendToken: "secret-token",
      activeBackend: {
        name: "Configured backend",
        baseUrl: "https://daemon.example.com",
        token: "secret-token",
      },
    });
  });

  it("prefers saved web backend targets from storage", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    window.localStorage.setItem(
      "codexmonitor.web-backends",
      JSON.stringify({
        version: 1,
        activeBackendId: "backend-2",
        backends: [
          {
            id: "backend-1",
            name: "Local",
            baseUrl: "http://127.0.0.1:4932",
            token: null,
          },
          {
            id: "backend-2",
            name: "Remote Office",
            baseUrl: "https://daemon.example.com/",
            token: "remote-secret",
          },
        ],
      }),
    );

    expect(readRuntimeConfig()).toMatchObject({
      runtime: "web",
      backendBaseUrl: "https://daemon.example.com",
      backendToken: "remote-secret",
      activeBackend: {
        id: "backend-2",
        name: "Remote Office",
        baseUrl: "https://daemon.example.com",
        token: "remote-secret",
      },
    });
  });
});
