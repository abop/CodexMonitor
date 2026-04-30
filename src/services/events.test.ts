import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event, EventCallback, UnlistenFn } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import type { AppServerEvent } from "../types";
import { subscribeBackendEvent } from "./backend/realtime";
import { isWebRuntime, readRuntimeConfig } from "./runtime";
import {
  subscribeAppServerEvents,
  subscribeMenuCycleCollaborationMode,
  subscribeMenuCycleModel,
  subscribeMenuNewAgent,
  subscribeTerminalOutput,
} from "./events";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("./backend/realtime", () => ({
  subscribeBackendEvent: vi.fn(),
}));

vi.mock("./runtime", () => ({
  isWebRuntime: vi.fn(() => false),
  readRuntimeConfig: vi.fn(() => ({
    runtime: "desktop",
    backendBaseUrl: null,
    backendToken: null,
    activeBackend: null,
  })),
}));

describe("events subscriptions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("delivers payloads and unsubscribes on cleanup", async () => {
    let listener: EventCallback<AppServerEvent> = () => {};
    const unlisten = vi.fn();

    vi.mocked(listen).mockImplementation((_event, handler) => {
      listener = handler as EventCallback<AppServerEvent>;
      return Promise.resolve(unlisten);
    });

    const onEvent = vi.fn();
    const cleanup = subscribeAppServerEvents(onEvent);
    const payload: AppServerEvent = {
      workspace_id: "ws-1",
      message: { method: "ping" },
    };

    const event: Event<AppServerEvent> = {
      event: "app-server-event",
      id: 1,
      payload,
    };
    listener(event);
    expect(onEvent).toHaveBeenCalledWith(payload);

    cleanup();
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("routes app-server events through backend websocket in web runtime", () => {
    vi.mocked(isWebRuntime).mockReturnValue(true);
    vi.mocked(readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: "https://daemon.example.com",
      backendToken: "secret-token",
      defaultBackendId: "backend-1",
      activeBackend: {
        id: "backend-1",
        name: "Remote Office",
        baseUrl: "https://daemon.example.com",
        token: "secret-token",
      },
    });
    const unlisten = vi.fn();
    let listener: ((payload: AppServerEvent) => void) | null = null;
    vi.mocked(subscribeBackendEvent).mockImplementation(
      (_config, eventName, onEvent) => {
        expect(eventName).toBe("app-server-event");
        listener = onEvent as (payload: AppServerEvent) => void;
        return unlisten;
      },
    );

    const onEvent = vi.fn();
    const cleanup = subscribeAppServerEvents(onEvent);
    const payload: AppServerEvent = {
      workspace_id: "ws-web",
      message: { method: "thread.updated" },
    };

    expect(listener).not.toBeNull();
    listener!(payload);
    expect(subscribeBackendEvent).toHaveBeenCalledWith(
      { baseUrl: "https://daemon.example.com", token: "secret-token" },
      "app-server-event",
      expect.any(Function),
      undefined,
    );
    expect(onEvent).toHaveBeenCalledWith(payload);
    expect(listen).not.toHaveBeenCalled();

    cleanup();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("treats non-app-server subscriptions as no-ops in web runtime", () => {
    vi.mocked(isWebRuntime).mockReturnValue(true);

    const cleanup = subscribeMenuNewAgent(() => {});

    expect(listen).not.toHaveBeenCalled();
    expect(subscribeBackendEvent).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });

  it("cleans up listeners that resolve after unsubscribe", async () => {
    let resolveListener: (handler: UnlistenFn) => void = () => {};
    const unlisten = vi.fn();

    vi.mocked(listen).mockImplementation(
      () =>
        new Promise<UnlistenFn>((resolve) => {
          resolveListener = resolve;
        }),
    );

    const cleanup = subscribeMenuNewAgent(() => {});
    cleanup();

    resolveListener(unlisten);
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("delivers menu events to subscribers", async () => {
    let listener: EventCallback<void> = () => {};
    const unlisten = vi.fn();

    vi.mocked(listen).mockImplementation((_event, handler) => {
      listener = handler as EventCallback<void>;
      return Promise.resolve(unlisten);
    });

    const onEvent = vi.fn();
    const cleanup = subscribeMenuCycleModel(onEvent);

    const event: Event<void> = {
      event: "menu-composer-cycle-model",
      id: 1,
      payload: undefined,
    };
    listener(event);
    expect(onEvent).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("delivers collaboration cycle menu events to subscribers", async () => {
    let listener: EventCallback<void> = () => {};
    const unlisten = vi.fn();

    vi.mocked(listen).mockImplementation((_event, handler) => {
      listener = handler as EventCallback<void>;
      return Promise.resolve(unlisten);
    });

    const onEvent = vi.fn();
    const cleanup = subscribeMenuCycleCollaborationMode(onEvent);

    const event: Event<void> = {
      event: "menu-composer-cycle-collaboration",
      id: 1,
      payload: undefined,
    };
    listener(event);
    expect(onEvent).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("reports listen errors through options", async () => {
    const error = new Error("nope");
    vi.mocked(listen).mockRejectedValueOnce(error);

    const onError = vi.fn();
    const cleanup = subscribeTerminalOutput(() => {}, { onError });

    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(error);

    cleanup();
  });
});
