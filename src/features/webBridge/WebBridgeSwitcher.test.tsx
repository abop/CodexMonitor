// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebBridgeProvider } from "./WebBridgeProvider";
import { WebBridgeSwitcher } from "./WebBridgeSwitcher";
import { addWebBridgeTarget, saveWebBridgeSettings } from "./webBridgeStorage";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

type MatchMediaMock = {
  setMatches: (matches: boolean) => void;
};

function installControllableMatchMedia(initialMatches = false): MatchMediaMock {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const mediaQueryList = {
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: vi.fn((type: string, listener: (event: MediaQueryListEvent) => void) => {
        if (type === "change") {
          listeners.add(listener);
        }
      }),
      removeEventListener: vi.fn((type: string, listener: (event: MediaQueryListEvent) => void) => {
        if (type === "change") {
          listeners.delete(listener);
        }
      }),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as MediaQueryList;

    return mediaQueryList;
  });

  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches: nextMatches, media: "(max-width: 700px)" } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

function seedTwoBridges() {
  const first = addWebBridgeTarget(
    { version: 1, activeBridgeId: null, bridges: [] },
    {
      name: "dev",
      baseUrl: "https://dev.example.com",
      nowMs: 100,
      activate: true,
    },
  );
  const second = addWebBridgeTarget(first, {
    name: "build",
    baseUrl: "https://build.example.com",
    nowMs: 200,
    activate: false,
  });
  saveWebBridgeSettings(second);
}

function renderSwitcher(options: {
  testConnection?: (baseUrl: string) => Promise<void>;
  reloadApp?: () => void;
  children?: ReactNode;
} = {}) {
  return render(
    <WebBridgeProvider
      testConnection={options.testConnection ?? vi.fn().mockResolvedValue(undefined)}
      reloadApp={options.reloadApp ?? vi.fn()}
    >
      {options.children ?? <WebBridgeSwitcher />}
    </WebBridgeProvider>,
  );
}

describe("WebBridgeSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  });

  it("shows the active bridge in the top control", () => {
    seedTwoBridges();

    renderSwitcher();

    expect(screen.getByRole("button", { name: /Current Bridge: dev/ })).toBeTruthy();
    expect(screen.getByText("dev.example.com")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
  });

  it("switches after a successful test", async () => {
    seedTwoBridges();
    const reloadApp = vi.fn();
    const testConnection = vi.fn().mockResolvedValue(undefined);

    renderSwitcher({ testConnection, reloadApp });
    fireEvent.click(screen.getByRole("button", { name: /Current Bridge: dev/ }));
    fireEvent.click(screen.getByRole("button", { name: /build/ }));

    await waitFor(() => {
      expect(testConnection).toHaveBeenCalledWith("https://build.example.com");
      expect(reloadApp).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the old bridge visible when switch test fails", async () => {
    seedTwoBridges();
    const reloadApp = vi.fn();
    const testConnection = vi.fn().mockRejectedValue(new Error("offline"));

    renderSwitcher({ testConnection, reloadApp });
    fireEvent.click(screen.getByRole("button", { name: /Current Bridge: dev/ }));
    fireEvent.click(screen.getByRole("button", { name: /build/ }));

    expect(await screen.findByText("offline")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Current Bridge: dev/ })).toBeTruthy();
    expect(reloadApp).not.toHaveBeenCalled();
  });

  it("adds a bridge through the manager only after test succeeds", async () => {
    seedTwoBridges();
    const testConnection = vi.fn().mockResolvedValue(undefined);

    renderSwitcher({ testConnection });
    fireEvent.click(screen.getByRole("button", { name: /Current Bridge: dev/ }));
    fireEvent.click(screen.getByRole("button", { name: "Manage Bridges" }));
    expect(screen.getByText("Bridge Management")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Bridge" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "prod" },
    });
    fireEvent.change(screen.getByLabelText("Bridge URL"), {
      target: { value: "https://prod.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test and Save" }));

    expect(await screen.findByText("prod")).toBeTruthy();
    expect(testConnection).toHaveBeenCalledWith("https://prod.example.com");
  });

  it("deletes a bridge from the manager list", async () => {
    seedTwoBridges();

    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: /Current Bridge: dev/ }));
    fireEvent.click(screen.getByRole("button", { name: "Manage Bridges" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]);

    expect(await screen.findByText("dev")).toBeTruthy();
    expect(screen.queryByText("build")).toBeNull();
  });

  it("shows validation error for an invalid bridge url", async () => {
    seedTwoBridges();
    const testConnection = vi.fn().mockResolvedValue(undefined);

    renderSwitcher({ testConnection });
    fireEvent.click(screen.getByRole("button", { name: /Current Bridge: dev/ }));
    fireEvent.click(screen.getByRole("button", { name: "Manage Bridges" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Bridge" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "broken" },
    });
    fireEvent.change(screen.getByLabelText("Bridge URL"), {
      target: { value: "not-a-url" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test and Save" }));

    expect(await screen.findByText("Bridge URL must start with http:// or https://.")).toBeTruthy();
    expect(testConnection).not.toHaveBeenCalled();
  });

  it("renders mobile picker as a bottom sheet", () => {
    seedTwoBridges();
    const matchMedia = installControllableMatchMedia(false);

    const { container } = renderSwitcher();
    act(() => {
      matchMedia.setMatches(true);
    });
    fireEvent.click(screen.getByRole("button", { name: /Current Bridge: dev/ }));

    expect(container.querySelector(".web-bridge-sheet")).toBeTruthy();
  });
});
