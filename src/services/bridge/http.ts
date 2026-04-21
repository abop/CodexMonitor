export type BridgeConfig = {
  baseUrl: string;
};

export type WebRuntimeCapabilities = {
  version: 1;
  methods: string[];
  threadControls: {
    steer: boolean;
    fork: boolean;
    compact: boolean;
    review: boolean;
    mcp: boolean;
  };
  files: {
    workspaceTree: boolean;
    workspaceAgents: boolean;
    globalAgents: boolean;
    globalConfig: boolean;
  };
  operations: {
    usageSnapshot: boolean;
    doctorReport: boolean;
    featureFlags: boolean;
  };
};

type JsonRpcPayload = {
  error?: {
    message?: string;
  };
  result?: unknown;
};

export async function bridgeRpc<T>(
  config: BridgeConfig,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${config.baseUrl}/api/rpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      method,
      params: params ?? {},
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as JsonRpcPayload;
  if (!response.ok || payload?.error?.message) {
    throw new Error(
      payload?.error?.message ?? `Bridge request failed (${response.status})`,
    );
  }

  if (!payload || typeof payload !== "object" || !("result" in payload)) {
    throw new Error("Bridge returned an invalid response.");
  }

  return payload.result as T;
}

export async function fetchBridgeCapabilities(
  config: BridgeConfig,
): Promise<WebRuntimeCapabilities> {
  const response = await fetch(`${config.baseUrl}/api/capabilities`, {
    method: "GET",
    credentials: "include",
  });

  return (await response.json()) as WebRuntimeCapabilities;
}

export async function testBridgeConnection(config: BridgeConfig) {
  await bridgeRpc<unknown[]>(config, "list_workspaces", {});
  return { ok: true as const };
}
