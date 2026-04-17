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
  it("does not load AGENTS.md or show a toast in web runtime", async () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    const { result } = renderHook(() =>
      useWorkspaceAgentMd({ activeWorkspace: workspace }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(vi.mocked(readAgentMd)).not.toHaveBeenCalled();
    expect(vi.mocked(pushErrorToast)).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
