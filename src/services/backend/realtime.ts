type Listener = (payload: unknown) => void;
type ErrorListener = (error: unknown) => void;
type SubscriptionOptions = {
  onError?: (error: unknown) => void;
};

type BackendEvent = {
  method?: string;
  params?: unknown;
};

export class BackendRealtimeClient {
  private socket: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private errorListeners = new Set<ErrorListener>();

  constructor(private readonly wsUrl: string) {}

  subscribe(eventName: string, listener: Listener, options?: SubscriptionOptions) {
    this.ensureSocket();
    const listeners = this.listeners.get(eventName) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
    if (options?.onError) {
      this.errorListeners.add(options.onError);
    }
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
    this.socket?.close();
    this.socket = null;
  }

  private ensureSocket() {
    if (this.socket) {
      return;
    }
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
      this.socket = null;
    };
    socket.onerror = (error) => {
      this.errorListeners.forEach((listener) => {
        listener(error);
      });
      this.socket = null;
    };
    this.socket = socket;
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
};

const realtimeClients = new Map<string, BackendRealtimeClient>();

function toWebSocketUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/ws`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function getBackendRealtimeClient(config: BackendConfig) {
  const existing = realtimeClients.get(config.baseUrl);
  if (existing) {
    return existing;
  }
  const client = new BackendRealtimeClient(toWebSocketUrl(config.baseUrl));
  realtimeClients.set(config.baseUrl, client);
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
