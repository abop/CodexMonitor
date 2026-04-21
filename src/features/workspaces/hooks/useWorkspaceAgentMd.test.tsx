// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { readAgentMd } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import { useWorkspaceAgentMd } from "./useWorkspaceAgentMd";

vi.mock("../../../services/tauri", () => ({
  readAgentMd: vi.fn(),
  writeAgentMd: vi.fn(),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "Project",
  path: "/tmp/project",
  connected: true,
  kind: "main",
  settings: {
    sidebarCollapsed: false,
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("useWorkspaceAgentMd", () => {
  it("stays inert in web runtime when workspace AGENTS capability is unavailable", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    const { result } = renderHook(() =>
      useWorkspaceAgentMd({ activeWorkspace: workspace, enabled: false }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(vi.mocked(readAgentMd)).not.toHaveBeenCalled();
    expect(vi.mocked(pushErrorToast)).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("loads AGENTS.md in web runtime when workspace AGENTS capability is available", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
    vi.mocked(readAgentMd).mockResolvedValue({
      exists: true,
      content: "# Agent",
      truncated: false,
    });

    const { result } = renderHook(() =>
      useWorkspaceAgentMd({ activeWorkspace: workspace, enabled: true }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(vi.mocked(readAgentMd)).toHaveBeenCalledWith("workspace-1");
    expect(result.current.content).toBe("# Agent");
    expect(result.current.exists).toBe(true);
    expect(result.current.error).toBeNull();
  });
});
