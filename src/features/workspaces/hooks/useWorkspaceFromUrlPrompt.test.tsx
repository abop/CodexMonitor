// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWorkspaceFromUrlPrompt } from "./useWorkspaceFromUrlPrompt";

describe("useWorkspaceFromUrlPrompt", () => {
  it("submits a manually entered destination path", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useWorkspaceFromUrlPrompt({ onSubmit }));

    act(() => {
      result.current.openWorkspaceFromUrlPrompt();
      result.current.updateWorkspaceFromUrlUrl("https://example.com/org/repo.git");
      result.current.updateWorkspaceFromUrlDestinationPath("/srv/repos");
      result.current.updateWorkspaceFromUrlTargetFolderName("repo");
    });

    expect(result.current.canSubmitWorkspaceFromUrlPrompt).toBe(true);

    await act(async () => {
      await result.current.submitWorkspaceFromUrlPrompt();
    });

    expect(onSubmit).toHaveBeenCalledWith(
      "https://example.com/org/repo.git",
      "/srv/repos",
      "repo",
    );
    expect(result.current.workspaceFromUrlPrompt).toBeNull();
  });
});
