/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileTreePanel } from "./FileTreePanel";

const menuNew = vi.hoisted(() => vi.fn(async ({ items }) => ({ popup: vi.fn(), items })));
const menuItemNew = vi.hoisted(() => vi.fn(async (options) => options));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((value: string) => value),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: `virtual-${index}`,
        index,
        size: 28,
        start: index * 28,
      })),
    getTotalSize: () => count * 28,
  }),
}));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: menuNew },
  MenuItem: { new: menuItemNew },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({})),
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalPosition: class LogicalPosition {
    x: number;
    y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
}));

describe("FileTreePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");
  });

  it("does not open the native context menu in web runtime", async () => {
    render(
      <FileTreePanel
        workspaceId="ws-1"
        workspacePath="/tmp/workspace"
        files={["src/main.ts"]}
        modifiedFiles={[]}
        isLoading={false}
        filePanelMode="files"
        onFilePanelModeChange={vi.fn()}
        onInsertText={vi.fn()}
        canInsertText
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
      />,
    );

    const fileRow = screen.getByText("main.ts").closest("button");
    expect(fileRow).not.toBeNull();

    fireEvent.contextMenu(fileRow as HTMLButtonElement);

    await waitFor(() => {
      expect(menuNew).not.toHaveBeenCalled();
    });
  });
});
