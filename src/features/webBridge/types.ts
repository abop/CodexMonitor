export type WebBridgeTarget = {
  id: string;
  name: string;
  baseUrl: string;
  createdAtMs: number;
  updatedAtMs: number;
  lastUsedAtMs: number | null;
};

export type WebBridgeSettings = {
  version: 1;
  activeBridgeId: string | null;
  bridges: WebBridgeTarget[];
};

export type LoadedWebBridgeSettings = WebBridgeSettings & {
  seedBridgeUrl: string | null;
};

export type WebBridgeDraft = {
  name: string;
  baseUrl: string;
};

export type NormalizedBridgeUrlResult =
  | { ok: true; value: string; warning: string | null }
  | { ok: false; error: string };
