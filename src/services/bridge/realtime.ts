type BridgeNotification = {
  method?: string;
  params?: unknown;
};

type Listener = (payload: unknown) => void;

const BRIDGE_RECONNECT_DELAY_MS = 1000;

export class BridgeRealtimeClient {
  private readonly listeners = new Map<string, Set<Listener>>();
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = new WebSocket(this.url);
    socket.addEventListener("message", this.handleMessage as EventListener);
    socket.addEventListener("error", () => {
      // Wait for the close event before reconnecting so browsers can finish
      // transitioning the socket state.
    });
    socket.addEventListener("close", () => {
      if (this.socket === socket) {
        this.socket = null;
        this.scheduleReconnect();
      }
    });
    this.socket = socket;
  }

  private scheduleReconnect() {
    if (
      !this.shouldReconnect ||
      this.listeners.size === 0 ||
      this.socket ||
      this.reconnectTimer
    ) {
      return;
    }
    this.reconnectTimer = globalThis.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.shouldReconnect || this.listeners.size === 0 || this.socket) {
        return;
      }
      this.ensureSocket();
    }, BRIDGE_RECONNECT_DELAY_MS);
  }

  subscribe(method: string, listener: Listener) {
    this.shouldReconnect = true;
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
        this.shouldReconnect = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.socket?.close();
        this.socket = null;
      }
    };
  }

  close() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.listeners.clear();
  }
}
