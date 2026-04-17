// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUiScaleShortcuts } from "./useUiScaleShortcuts";

const setZoomMock = vi.fn();
const getCurrentWebviewMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: getCurrentWebviewMock,
}));

describe("useUiScaleShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    setZoomMock.mockResolvedValue(undefined);
    getCurrentWebviewMock.mockReturnValue({
      setZoom: setZoomMock,
    });
  });

  it("does not touch the Tauri webview API in web runtime", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    renderHook(() =>
      useUiScaleShortcuts({
        settings: {
          uiScale: 1,
        } as never,
        setSettings: vi.fn(),
        saveSettings: vi.fn(),
      }),
    );

    expect(getCurrentWebviewMock).not.toHaveBeenCalled();
    expect(setZoomMock).not.toHaveBeenCalled();
  });
});
