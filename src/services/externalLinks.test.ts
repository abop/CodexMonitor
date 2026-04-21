// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openExternalUrl } from "./externalLinks";

const openUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (...args: unknown[]) => openUrlMock(...args),
}));

describe("openExternalUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("opens browser URLs with window.open in web runtime", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    const windowOpen = vi.fn();
    Object.defineProperty(window, "open", {
      value: windowOpen,
      configurable: true,
      writable: true,
    });

    await openExternalUrl("https://example.com/docs");

    expect(windowOpen).toHaveBeenCalledWith(
      "https://example.com/docs",
      "_blank",
      "noopener,noreferrer",
    );
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it("uses the Tauri opener outside the web runtime", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "desktop");

    await openExternalUrl("https://example.com/docs");

    expect(openUrlMock).toHaveBeenCalledWith("https://example.com/docs");
  });
});
