/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function renderApp(runtime: "web" | "desktop") {
  vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", runtime);
  vi.doMock("@/features/layout/hooks/useWindowLabel", () => ({
    useWindowLabel: () => "main",
  }));
  vi.doMock("@app/components/MainApp", () => ({
    default: () => <div>Main app mounted</div>,
  }));

  const { default: App } = await import("./App");
  return render(<App />);
}

describe("App", () => {
  it("shows the bridge setup dialog on web before the main app mounts", async () => {
    await renderApp("web");

    expect(screen.getByRole("dialog", { name: "Connect a Bridge" })).toBeTruthy();
    expect(screen.queryByText("Main app mounted")).toBeNull();
  });

  it("mounts the main app on desktop without bridge setup", async () => {
    await renderApp("desktop");

    expect(screen.getByText("Main app mounted")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Connect a Bridge" })).toBeNull();
  });
});
