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
    workspaceAgentsWrite: boolean;
    globalAgents: boolean;
    globalAgentsWrite: boolean;
    globalConfig: boolean;
  };
  operations: {
    usageSnapshot: boolean;
    doctorReport: boolean;
    featureFlags: boolean;
    accountLogin: boolean;
    worktreeSetupStatus: boolean;
    agentsSettings: boolean;
  };
};

type JsonRpcPayload = {
  error?: {
    message?: string;
  };
  result?: unknown;
};

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWebRuntimeCapabilities(
  payload: unknown,
): payload is WebRuntimeCapabilities {
  if (!isRecord(payload)) {
    return false;
  }

  const { version, methods, threadControls, files, operations } = payload;
  if (version !== 1 || !isStringArray(methods)) {
    return false;
  }

  if (!isRecord(threadControls) || !isRecord(files) || !isRecord(operations)) {
    return false;
  }

  return (
    isBoolean(threadControls.steer) &&
    isBoolean(threadControls.fork) &&
    isBoolean(threadControls.compact) &&
    isBoolean(threadControls.review) &&
    isBoolean(threadControls.mcp) &&
    isBoolean(files.workspaceTree) &&
    isBoolean(files.workspaceAgents) &&
    isBoolean(files.workspaceAgentsWrite) &&
    isBoolean(files.globalAgents) &&
    isBoolean(files.globalAgentsWrite) &&
    isBoolean(files.globalConfig) &&
    isBoolean(operations.usageSnapshot) &&
    isBoolean(operations.doctorReport) &&
    isBoolean(operations.featureFlags) &&
    isBoolean(operations.accountLogin) &&
    isBoolean(operations.worktreeSetupStatus) &&
    isBoolean(operations.agentsSettings)
  );
}

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

  const payload = (await response.json().catch(() => ({}))) as JsonRpcPayload;
  if (!response.ok) {
    throw new Error(`Bridge request failed (${response.status})`);
  }
  if (!isWebRuntimeCapabilities(payload)) {
    throw new Error("Bridge returned an invalid response.");
  }
  return payload;
}

export async function testBridgeConnection(config: BridgeConfig) {
  await bridgeRpc<unknown[]>(config, "list_workspaces", {});
  return { ok: true as const };
}
