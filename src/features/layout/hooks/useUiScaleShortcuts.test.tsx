/* @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/types";

const { getCurrentWebviewMock } = vi.hoisted(() => ({
  getCurrentWebviewMock: vi.fn(() => {
    throw new Error("tauri webview unavailable");
  }),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: getCurrentWebviewMock,
}));

vi.mock("@services/runtime", () => ({
  isWebRuntime: vi.fn(() => true),
}));

import { useUiScaleShortcuts } from "./useUiScaleShortcuts";

describe("useUiScaleShortcuts", () => {
  it("does not touch tauri webview zoom in web runtime", () => {
    expect(() =>
      renderHook(() =>
        useUiScaleShortcuts({
          settings: { uiScale: 1 } as AppSettings,
          setSettings: vi.fn(),
          saveSettings: vi.fn(async (next: AppSettings) => next),
        }),
      ),
    ).not.toThrow();

    expect(getCurrentWebviewMock).not.toHaveBeenCalled();
  });
});
