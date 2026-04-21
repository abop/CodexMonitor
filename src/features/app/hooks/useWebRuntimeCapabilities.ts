import { useEffect, useState } from "react";
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
    globalAgents: true,
    globalConfig: true,
  },
  operations: {
    usageSnapshot: true,
    doctorReport: true,
    featureFlags: true,
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
    globalAgents: false,
    globalConfig: false,
  },
  operations: {
    usageSnapshot: false,
    doctorReport: false,
    featureFlags: false,
  },
};

export function useWebRuntimeCapabilities() {
  const initialRuntimeConfig = readRuntimeConfig();
  const runtime = initialRuntimeConfig.runtime;
  const [bridgeBaseUrl, setBridgeBaseUrl] = useState(
    initialRuntimeConfig.bridgeBaseUrl,
  );
  const [capabilities, setCapabilities] = useState<WebRuntimeCapabilities>(
    runtime === "web"
      ? WEB_SAFE_RUNTIME_CAPABILITIES
      : DESKTOP_RUNTIME_CAPABILITIES,
  );

  useEffect(() => {
    if (runtime !== "web") {
      return undefined;
    }
    return subscribeRuntimeBridgeBaseUrl((nextBridgeBaseUrl) => {
      setBridgeBaseUrl(nextBridgeBaseUrl);
    });
  }, [runtime]);

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
