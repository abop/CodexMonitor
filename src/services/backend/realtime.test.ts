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
}

describe("backend realtime client", () => {
  afterEach(() => {
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
});
