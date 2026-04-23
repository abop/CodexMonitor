/* @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";

const { getCurrentWindowMock } = vi.hoisted(() => ({
  getCurrentWindowMock: vi.fn(() => {
    throw new Error("tauri window unavailable");
  }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: getCurrentWindowMock,
}));

vi.mock("./runtime", () => ({
  isWebRuntime: vi.fn(() => true),
}));

import { subscribeWindowDragDrop } from "./dragDrop";

describe("dragDrop", () => {
  it("does not subscribe to tauri drag-drop events in web runtime", () => {
    expect(() => subscribeWindowDragDrop(() => {})).not.toThrow();
    expect(getCurrentWindowMock).not.toHaveBeenCalled();
  });
});
