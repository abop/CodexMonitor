type Listener = (payload: unknown) => void;
type ErrorListener = (error: unknown) => void;
type SubscriptionOptions = {
  onError?: (error: unknown) => void;
};

type BackendEvent = {
  method?: string;
  params?: unknown;
};

const RECONNECT_DELAY_MS = 500;

export class BackendRealtimeClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private errorListeners = new Set<ErrorListener>();
  private closedByClient = false;

  constructor(private readonly wsUrl: string) {}

  subscribe(eventName: string, listener: Listener, options?: SubscriptionOptions) {
    const listeners = this.listeners.get(eventName) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
    if (options?.onError) {
      this.errorListeners.add(options.onError);
    }
    this.closedByClient = false;
    this.ensureSocket();
    return () => {
      const current = this.listeners.get(eventName);
      if (!current) {
        if (options?.onError) {
          this.errorListeners.delete(options.onError);
        }
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(eventName);
      }
      if (options?.onError) {
        this.errorListeners.delete(options.onError);
      }
      if (this.listeners.size === 0) {
        this.close();
      }
    };
  }

  close() {
    this.closedByClient = true;
    this.clearReconnectTimer();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private ensureSocket() {
    if (this.socket || !this.hasListeners()) {
      return;
    }
    this.closedByClient = false;
    const socket = new WebSocket(this.wsUrl);
    socket.onmessage = (event) => {
      const parsed = this.parseMessage(event.data);
      if (!parsed?.method) {
        return;
      }
      const listeners = this.listeners.get(parsed.method);
      if (!listeners) {
        return;
      }
      listeners.forEach((listener) => {
        listener(parsed.params);
      });
    };
    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      try {
        socket.close();
      } catch {
        // Browsers may already be closing this socket after an error event.
      }
      if (!this.closedByClient) {
        this.scheduleReconnect();
      }
    };
    socket.onerror = (error) => {
      this.errorListeners.forEach((listener) => {
        listener(error);
      });
      if (this.socket === socket) {
        this.socket = null;
      }
      if (!this.closedByClient) {
        this.scheduleReconnect();
      }
    };
    this.socket = socket;
  }

  private hasListeners() {
    return this.listeners.size > 0;
  }

  private scheduleReconnect() {
    if (this.socket || this.reconnectTimer || !this.hasListeners()) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureSocket();
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private parseMessage(message: unknown): BackendEvent | null {
    if (typeof message !== "string") {
      return null;
    }
    try {
      const parsed = JSON.parse(message) as BackendEvent;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
}

type BackendConfig = {
  baseUrl: string;
  token?: string | null;
};

const realtimeClients = new Map<string, BackendRealtimeClient>();

function toWebSocketUrl(baseUrl: string, token?: string | null) {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/ws`;
  url.search = "";
  if (token) {
    url.searchParams.set("token", token);
  }
  url.hash = "";
  return url.toString();
}

function getBackendRealtimeClient(config: BackendConfig) {
  const cacheKey = `${config.baseUrl}::${config.token ?? ""}`;
  const existing = realtimeClients.get(cacheKey);
  if (existing) {
    return existing;
  }
  const client = new BackendRealtimeClient(
    toWebSocketUrl(config.baseUrl, config.token),
  );
  realtimeClients.set(cacheKey, client);
  return client;
}

export function subscribeBackendEvent(
  config: BackendConfig,
  eventName: string,
  listener: Listener,
  options?: SubscriptionOptions,
) {
  return getBackendRealtimeClient(config).subscribe(eventName, listener, options);
}
