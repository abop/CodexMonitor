import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeBackendEvent } from "./realtime";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: Event) => void) | null = null;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.onclose?.();
  }

  closeFromServer() {
    this.onclose?.();
  }

  emit(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
  }
}

describe("backend realtime client", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeWebSocket.instances = [];
  });

  it("passes backend tokens through the websocket url", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

    const cleanup = subscribeBackendEvent(
      { baseUrl: "https://daemon.example.com", token: "secret-token" } as never,
      "app-server-event",
      vi.fn(),
    );

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.url).toBe(
      "wss://daemon.example.com/ws?token=secret-token",
    );

    cleanup();
  });

  it("reconnects when the websocket closes while listeners are active", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

    const onEvent = vi.fn();
    const cleanup = subscribeBackendEvent(
      { baseUrl: "https://daemon.example.com" } as never,
      "app-server-event",
      onEvent,
    );

    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0]?.closeFromServer();
    await vi.advanceTimersByTimeAsync(500);

    expect(FakeWebSocket.instances).toHaveLength(2);

    const payload = {
      workspace_id: "ws-1",
      message: { method: "turn/started" },
    };
    FakeWebSocket.instances[1]?.emit({
      method: "app-server-event",
      params: payload,
    });

    expect(onEvent).toHaveBeenCalledWith(payload);

    cleanup();
  });

  it("does not reconnect after the last listener unsubscribes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

    const cleanup = subscribeBackendEvent(
      { baseUrl: "https://daemon.example.com" } as never,
      "app-server-event",
      vi.fn(),
    );

    expect(FakeWebSocket.instances).toHaveLength(1);

    cleanup();
    await vi.advanceTimersByTimeAsync(500);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
