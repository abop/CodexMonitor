// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRuntimeWebBackendWindowUrl,
  deleteRuntimeWebBackend,
  getActiveRuntimeWebBackendId,
  isWebRuntime,
  readRuntimeConfig,
  resetRuntimeBackendBaseUrlForTests,
  resolveAppRuntime,
  setActiveRuntimeWebBackend,
  setDefaultRuntimeWebBackend,
  setRuntimeBackendBaseUrl,
  subscribeRuntimeConfig,
  upsertRuntimeWebBackend,
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
      defaultBackendId: null,
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

  it("uses a url backend override before session, default, and env backends", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    vi.stubEnv("VITE_CODEXMONITOR_BACKEND_URL", "https://env.example.com");
    window.localStorage.setItem(
      "codexmonitor.web-backends",
      JSON.stringify({
        version: 1,
        activeBackendId: "backend-default",
        backends: [
          {
            id: "backend-default",
            name: "Default",
            baseUrl: "https://default.example.com",
            token: null,
          },
          {
            id: "backend-session",
            name: "Session",
            baseUrl: "https://session.example.com",
            token: null,
          },
          {
            id: "backend-url",
            name: "URL",
            baseUrl: "https://url.example.com",
            token: "url-token",
          },
        ],
      }),
    );
    setActiveRuntimeWebBackend("backend-session");
    window.history.pushState({}, "", "/threads?view=all&backend=backend-url#focus");

    expect(getActiveRuntimeWebBackendId()).toBe("backend-url");
    expect(readRuntimeConfig()).toMatchObject({
      runtime: "web",
      backendBaseUrl: "https://url.example.com",
      backendToken: "url-token",
      defaultBackendId: "backend-default",
      activeBackend: {
        id: "backend-url",
        name: "URL",
      },
    });
  });

  it("uses the current window backend without changing the shared default backend", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    window.localStorage.setItem(
      "codexmonitor.web-backends",
      JSON.stringify({
        version: 1,
        activeBackendId: "backend-default",
        backends: [
          {
            id: "backend-default",
            name: "Default",
            baseUrl: "https://default.example.com",
            token: null,
          },
          {
            id: "backend-window",
            name: "Window",
            baseUrl: "https://window.example.com",
            token: null,
          },
        ],
      }),
    );

    setActiveRuntimeWebBackend("backend-window");

    expect(getActiveRuntimeWebBackendId()).toBe("backend-window");
    expect(readRuntimeConfig()).toMatchObject({
      backendBaseUrl: "https://window.example.com",
      defaultBackendId: "backend-default",
      activeBackend: {
        id: "backend-window",
      },
    });
    expect(
      JSON.parse(window.localStorage.getItem("codexmonitor.web-backends") ?? "{}")
        .activeBackendId,
    ).toBe("backend-default");
  });

  it("updates the shared default backend separately from the current window backend", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    window.localStorage.setItem(
      "codexmonitor.web-backends",
      JSON.stringify({
        version: 1,
        activeBackendId: "backend-1",
        backends: [
          {
            id: "backend-1",
            name: "One",
            baseUrl: "https://one.example.com",
            token: null,
          },
          {
            id: "backend-2",
            name: "Two",
            baseUrl: "https://two.example.com",
            token: null,
          },
        ],
      }),
    );
    setActiveRuntimeWebBackend("backend-1");

    setDefaultRuntimeWebBackend("backend-2");

    expect(getActiveRuntimeWebBackendId()).toBe("backend-1");
    expect(readRuntimeConfig()).toMatchObject({
      backendBaseUrl: "https://one.example.com",
      defaultBackendId: "backend-2",
      activeBackend: {
        id: "backend-1",
      },
    });
    expect(
      JSON.parse(window.localStorage.getItem("codexmonitor.web-backends") ?? "{}")
        .activeBackendId,
    ).toBe("backend-2");
  });

  it("builds a backend window url preserving path, unrelated params, and hash", () => {
    window.history.pushState(
      {},
      "",
      "/workspaces/acme?view=list&backend=old&filter=open#thread-1",
    );

    expect(buildRuntimeWebBackendWindowUrl("backend-new")).toBe(
      `${window.location.origin}/workspaces/acme?view=list&backend=backend-new&filter=open#thread-1`,
    );
  });

  it("uses normalized backend url as the name when a saved backend name is blank", () => {
    const backend = upsertRuntimeWebBackend({
      name: "   ",
      baseUrl: "https://daemon.example.com///",
    });

    expect(backend.name).toBe("https://daemon.example.com");
    expect(readRuntimeConfig()).toMatchObject({
      defaultBackendId: backend.id,
      activeBackend: {
        id: backend.id,
        name: "https://daemon.example.com",
      },
    });
  });

  it("clears stale current window selection when deleting that backend", () => {
    const backend1 = upsertRuntimeWebBackend({
      name: "One",
      baseUrl: "https://one.example.com",
    });
    const backend2 = upsertRuntimeWebBackend({
      name: "Two",
      baseUrl: "https://two.example.com",
    });
    setDefaultRuntimeWebBackend(backend1.id);
    setActiveRuntimeWebBackend(backend2.id);

    deleteRuntimeWebBackend(backend2.id);

    expect(getActiveRuntimeWebBackendId()).toBe(backend1.id);
    expect(readRuntimeConfig()).toMatchObject({
      backendBaseUrl: "https://one.example.com",
      defaultBackendId: backend1.id,
      activeBackend: {
        id: backend1.id,
      },
    });
  });

  it("reset clears current window backend selection and runtime listeners", () => {
    const listener = vi.fn();
    const backend = upsertRuntimeWebBackend({
      name: "One",
      baseUrl: "https://one.example.com",
    });
    setActiveRuntimeWebBackend(backend.id);
    subscribeRuntimeConfig(listener);

    resetRuntimeBackendBaseUrlForTests();
    window.localStorage.setItem(
      "codexmonitor.web-backends",
      JSON.stringify({
        version: 1,
        activeBackendId: "backend-default",
        backends: [
          {
            id: "backend-default",
            name: "Default",
            baseUrl: "https://default.example.com",
            token: null,
          },
        ],
      }),
    );

    setRuntimeBackendBaseUrl("https://override.example.com");

    expect(getActiveRuntimeWebBackendId()).toBe("backend-default");
    expect(listener).not.toHaveBeenCalled();
  });
});
