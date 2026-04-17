type BridgeConfig = {
  baseUrl: string;
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

  if (!("result" in payload)) {
    throw new Error("Bridge returned an invalid response.");
  }

  return payload.result as T;
}

export async function testBridgeConnection(config: BridgeConfig) {
  await bridgeRpc<unknown[]>(config, "list_workspaces", {});
  return { ok: true as const };
}
