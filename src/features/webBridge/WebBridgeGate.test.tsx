// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebBridgeGate } from "./WebBridgeGate";
import { WebBridgeProvider } from "./WebBridgeProvider";
import { addWebBridgeTarget, saveWebBridgeSettings } from "./webBridgeStorage";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
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
