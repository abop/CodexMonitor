type BridgeNotification = {
  method?: string;
  params?: unknown;
};

type Listener = (payload: unknown) => void;

export class BridgeRealtimeClient {
  private readonly listeners = new Map<string, Set<Listener>>();
  private socket: WebSocket | null = null;

  constructor(private readonly url: string) {}

  private handleMessage = (event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(String(event.data)) as BridgeNotification;
      if (typeof payload.method !== "string") {
        return;
      }
      const listeners = this.listeners.get(payload.method);
      listeners?.forEach((listener) => listener(payload.params));
    } catch (error) {
      console.error("[bridge] Failed to parse realtime message", error);
    }
  };

  private ensureSocket() {
    if (this.socket) {
      return;
    }
    const socket = new WebSocket(this.url);
    socket.addEventListener("message", this.handleMessage as EventListener);
    socket.addEventListener("close", () => {
      if (this.socket === socket) {
        this.socket = null;
      }
    });
    this.socket = socket;
  }

  subscribe(method: string, listener: Listener) {
    this.ensureSocket();
    const listeners = this.listeners.get(method) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(method, listeners);

    return () => {
      const next = this.listeners.get(method);
      next?.delete(listener);
      if (next && next.size === 0) {
        this.listeners.delete(method);
      }
      if (this.listeners.size === 0) {
        this.socket?.close();
        this.socket = null;
      }
    };
  }
}
