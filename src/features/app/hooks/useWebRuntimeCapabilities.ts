import { useEffect, useState, useSyncExternalStore } from "react";
import {
  fetchBridgeCapabilities,
  type WebRuntimeCapabilities,
} from "@/services/bridge/http";
import {
  readRuntimeConfig,
  subscribeRuntimeBridgeBaseUrl,
} from "@/services/runtime";

const DESKTOP_RUNTIME_CAPABILITIES: WebRuntimeCapabilities = {
  version: 1,
  methods: [],
  threadControls: {
    steer: true,
    fork: true,
    compact: true,
    review: true,
    mcp: true,
  },
  files: {
    workspaceTree: true,
    workspaceAgents: true,
    workspaceAgentsWrite: true,
    globalAgents: true,
    globalConfig: true,
  },
  operations: {
    usageSnapshot: true,
    doctorReport: true,
    featureFlags: true,
    accountLogin: true,
    worktreeSetupStatus: true,
    agentsSettings: true,
  },
};

const WEB_SAFE_RUNTIME_CAPABILITIES: WebRuntimeCapabilities = {
  version: 1,
  methods: [],
  threadControls: {
    steer: false,
    fork: false,
    compact: false,
    review: false,
    mcp: false,
  },
  files: {
    workspaceTree: false,
    workspaceAgents: false,
    workspaceAgentsWrite: false,
    globalAgents: false,
    globalConfig: false,
  },
  operations: {
    usageSnapshot: false,
    doctorReport: false,
    featureFlags: false,
    accountLogin: false,
    worktreeSetupStatus: false,
    agentsSettings: false,
  },
};

export function useWebRuntimeCapabilities() {
  const runtime = readRuntimeConfig().runtime;
  const bridgeBaseUrl = useSyncExternalStore(
    subscribeRuntimeBridgeBaseUrl,
    () => readRuntimeConfig().bridgeBaseUrl,
    () => readRuntimeConfig().bridgeBaseUrl,
  );
  const [capabilities, setCapabilities] = useState<WebRuntimeCapabilities>(
    runtime === "web"
      ? WEB_SAFE_RUNTIME_CAPABILITIES
      : DESKTOP_RUNTIME_CAPABILITIES,
  );

  useEffect(() => {
    if (runtime !== "web") {
      setCapabilities(DESKTOP_RUNTIME_CAPABILITIES);
      return undefined;
    }

    setCapabilities(WEB_SAFE_RUNTIME_CAPABILITIES);
    if (!bridgeBaseUrl) {
      return undefined;
    }

    let cancelled = false;

    void fetchBridgeCapabilities({ baseUrl: bridgeBaseUrl })
      .then((nextCapabilities) => {
        if (!cancelled) {
          setCapabilities(nextCapabilities);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCapabilities(WEB_SAFE_RUNTIME_CAPABILITIES);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bridgeBaseUrl, runtime]);

  return capabilities;
}
