import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event, EventCallback, UnlistenFn } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import type { AppServerEvent } from "../types";
import {
  resetBridgeRealtimeClient,
  subscribeAppServerEvents,
  subscribeMenuCycleCollaborationMode,
  subscribeMenuCycleModel,
  subscribeMenuNewAgent,
  subscribeTerminalOutput,
} from "./events";
import {
  resetRuntimeBridgeBaseUrlForTests,
  setRuntimeBridgeBaseUrl,
} from "./runtime";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

describe("events subscriptions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetBridgeRealtimeClient();
    resetRuntimeBridgeBaseUrlForTests();
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "desktop");
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

  it("subscribes to bridge websocket app-server events in web runtime", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://bridge.example.com");

    let onMessage: ((event: MessageEvent<string>) => void) | undefined;
    const close = vi.fn();
    const addEventListener = vi.fn((type: string, handler: EventListener) => {
      if (type === "message") {
        onMessage = handler as (event: MessageEvent<string>) => void;
      }
    });
    vi.stubGlobal(
      "WebSocket",
      vi.fn(() => ({ addEventListener, close })),
    );

    const onEvent = vi.fn();
    const cleanup = subscribeAppServerEvents(onEvent);

    expect(WebSocket).toHaveBeenCalledWith("wss://bridge.example.com/ws");
    expect(listen).not.toHaveBeenCalled();

    const payload: AppServerEvent = {
      workspace_id: "ws-1",
      message: { method: "ping" },
    };
    if (!onMessage) {
      throw new Error("WebSocket message handler not registered");
    }
    onMessage({
      data: JSON.stringify({ method: "app-server-event", params: payload }),
    } as MessageEvent<string>);

    expect(onEvent).toHaveBeenCalledWith(payload);

    cleanup();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes the old bridge websocket when the runtime bridge URL changes", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://old.example.com");

    const close = vi.fn();
    const addEventListener = vi.fn();
    vi.stubGlobal(
      "WebSocket",
      vi.fn(() => ({
        addEventListener,
        close,
      })),
    );

    const cleanup = subscribeAppServerEvents(() => {});

    expect(WebSocket).toHaveBeenCalledWith("wss://old.example.com/ws");
    expect(close).not.toHaveBeenCalled();

    setRuntimeBridgeBaseUrl("https://new.example.com");

    expect(close).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("reattaches live app-server subscriptions when the runtime bridge URL changes", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://old.example.com");

    const close = vi.fn();
    const addEventListener = vi.fn();
    const webSocket = vi.fn(() => ({
      addEventListener,
      close,
    }));
    vi.stubGlobal("WebSocket", webSocket);

    const cleanup = subscribeAppServerEvents(() => {});

    expect(WebSocket).toHaveBeenCalledWith("wss://old.example.com/ws");

    setRuntimeBridgeBaseUrl("https://new.example.com");

    expect(close).toHaveBeenCalledTimes(1);
    expect(WebSocket).toHaveBeenNthCalledWith(2, "wss://new.example.com/ws");

    cleanup();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("uses the saved runtime bridge URL for websocket events", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://env.example.com");
    setRuntimeBridgeBaseUrl("https://saved.example.com");
    vi.stubGlobal(
      "WebSocket",
      vi.fn(() => ({
        addEventListener: vi.fn(),
        close: vi.fn(),
      })),
    );

    const cleanup = subscribeAppServerEvents(() => {});

    expect(WebSocket).toHaveBeenCalledWith("wss://saved.example.com/ws");
    cleanup();
  });

  it("closes the bridge websocket when resetBridgeRealtimeClient is called", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://bridge.example.com");
    const close = vi.fn();
    vi.stubGlobal(
      "WebSocket",
      vi.fn(() => ({
        addEventListener: vi.fn(),
        close,
      })),
    );

    const cleanup = subscribeAppServerEvents(() => {});
    resetBridgeRealtimeClient();

    expect(close).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("treats non app-server desktop events as no-ops in web runtime", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    vi.stubEnv("VITE_CODEXMONITOR_BRIDGE_URL", "https://bridge.example.com");
    vi.stubGlobal("WebSocket", vi.fn());

    const onEvent = vi.fn();
    const cleanup = subscribeMenuNewAgent(onEvent);

    expect(listen).not.toHaveBeenCalled();
    expect(WebSocket).not.toHaveBeenCalled();

    cleanup();
    expect(onEvent).not.toHaveBeenCalled();
  });
});
