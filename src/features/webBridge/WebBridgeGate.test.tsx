// @vitest-environment jsdom
import { useEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readRuntimeConfig, resetRuntimeBridgeBaseUrlForTests } from "@services/runtime";
import { WebBridgeGate } from "./WebBridgeGate";
import { WebBridgeProvider } from "./WebBridgeProvider";
import { addWebBridgeTarget, saveWebBridgeSettings } from "./webBridgeStorage";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  resetRuntimeBridgeBaseUrlForTests();
});

describe("WebBridgeGate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows setup instead of children when web has no bridge", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    render(
      <WebBridgeProvider testConnection={vi.fn().mockResolvedValue(undefined)}>
        <WebBridgeGate>
          <div>App content</div>
        </WebBridgeGate>
      </WebBridgeProvider>,
    );

    expect(screen.getByRole("dialog", { name: "Connect a Bridge" })).toBeTruthy();
    expect(screen.queryByText("App content")).toBeNull();
  });

  it("renders children after a bridge is saved", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    saveWebBridgeSettings(
      addWebBridgeTarget(
        { version: 1, activeBridgeId: null, bridges: [] },
        {
          name: "dev",
          baseUrl: "https://dev.example.com",
          nowMs: 100,
          activate: true,
        },
      ),
    );

    render(
      <WebBridgeProvider testConnection={vi.fn().mockResolvedValue(undefined)}>
        <WebBridgeGate>
          <div>App content</div>
        </WebBridgeGate>
      </WebBridgeProvider>,
    );

    expect(screen.getByText("App content")).toBeTruthy();
  });

  it("syncs the runtime bridge before releasing children after first save", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    const observedBridgeUrl = vi.fn();

    function AppProbe() {
      useEffect(() => {
        observedBridgeUrl(readRuntimeConfig().bridgeBaseUrl);
      }, []);

      return <div>App content</div>;
    }

    render(
      <WebBridgeProvider testConnection={vi.fn().mockResolvedValue(undefined)}>
        <WebBridgeGate>
          <AppProbe />
        </WebBridgeGate>
      </WebBridgeProvider>,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "dev" },
    });
    fireEvent.change(screen.getByLabelText("Bridge URL"), {
      target: { value: "https://dev.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test and Save" }));

    await waitFor(() => {
      expect(screen.getByText("App content")).toBeTruthy();
    });

    expect(observedBridgeUrl).toHaveBeenCalledWith("https://dev.example.com");
    expect(observedBridgeUrl).not.toHaveBeenCalledWith(null);
  });

  it("renders children on desktop", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "desktop");

    render(
      <WebBridgeProvider testConnection={vi.fn().mockResolvedValue(undefined)}>
        <WebBridgeGate>
          <div>Desktop content</div>
        </WebBridgeGate>
      </WebBridgeProvider>,
    );

    expect(screen.getByText("Desktop content")).toBeTruthy();
  });
});
