type BridgeConfig = {
  baseUrl: string;
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

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error?.message) {
    throw new Error(
      payload?.error?.message ?? `Bridge request failed (${response.status})`,
    );
  }

  return payload.result as T;
}
