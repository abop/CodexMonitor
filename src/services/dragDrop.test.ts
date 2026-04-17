/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeWindowDragDrop } from "./dragDrop";

const getCurrentWindowMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: getCurrentWindowMock,
}));

describe("subscribeWindowDragDrop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails safely when the Tauri window handle is unavailable", () => {
    const error = new Error("missing current window");
    const onError = vi.fn();
    getCurrentWindowMock.mockImplementation(() => {
      throw error;
    });

    expect(() => subscribeWindowDragDrop(() => {}, { onError })).not.toThrow();
    expect(onError).toHaveBeenCalledWith(error);
  });
});
