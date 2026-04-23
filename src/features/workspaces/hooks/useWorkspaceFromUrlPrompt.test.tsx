// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pickWorkspacePath } from "../../../services/tauri";
import { isWebRuntime } from "../../../services/runtime";
import { useWorkspaceFromUrlPrompt } from "./useWorkspaceFromUrlPrompt";

vi.mock("../../../services/tauri", () => ({
  pickWorkspacePath: vi.fn(),
}));

vi.mock("../../../services/runtime", () => ({
  isWebRuntime: vi.fn(() => false),
}));

describe("useWorkspaceFromUrlPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWebRuntime).mockReturnValue(false);
  });

  it("uses the native picker for destination paths outside web runtime", async () => {
    vi.mocked(pickWorkspacePath).mockResolvedValue("/tmp/projects");

    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useWorkspaceFromUrlPrompt({ onSubmit }));

    act(() => {
      result.current.openWorkspaceFromUrlPrompt();
    });

    await act(async () => {
      await result.current.chooseWorkspaceFromUrlDestinationPath();
    });

    expect(pickWorkspacePath).toHaveBeenCalledTimes(1);
    expect(result.current.workspaceFromUrlPrompt?.destinationPath).toBe("/tmp/projects");
    expect(result.current.canChooseWorkspaceFromUrlDestinationPath).toBe(true);
  });

  it("lets web runtime enter a destination path without using the native picker", async () => {
    vi.mocked(isWebRuntime).mockReturnValue(true);

    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useWorkspaceFromUrlPrompt({ onSubmit }));

    act(() => {
      result.current.openWorkspaceFromUrlPrompt();
    });

    act(() => {
      result.current.updateWorkspaceFromUrlUrl("https://github.com/openai/codex.git");
      result.current.updateWorkspaceFromUrlDestinationPath(
        "/Users/gufei/workspace",
      );
      result.current.updateWorkspaceFromUrlTargetFolderName("codex");
    });

    await act(async () => {
      await result.current.chooseWorkspaceFromUrlDestinationPath();
      await result.current.submitWorkspaceFromUrlPrompt();
    });

    expect(pickWorkspacePath).not.toHaveBeenCalled();
    expect(result.current.canChooseWorkspaceFromUrlDestinationPath).toBe(false);
    expect(onSubmit).toHaveBeenCalledWith(
      "https://github.com/openai/codex.git",
      "/Users/gufei/workspace",
      "codex",
    );
    expect(result.current.workspaceFromUrlPrompt).toBeNull();
  });
});
