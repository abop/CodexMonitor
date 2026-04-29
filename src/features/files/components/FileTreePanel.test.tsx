/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileTreePanel } from "./FileTreePanel";

const isWebRuntimeMock = vi.hoisted(() => vi.fn(() => true));
const menuNew = vi.hoisted(() => vi.fn(async ({ items }) => ({ popup: vi.fn(), items })));
const menuItemNew = vi.hoisted(() => vi.fn(async (options) => options));
const predefinedMenuItemNew = vi.hoisted(() => vi.fn(async (options) => options));

vi.mock("@services/runtime", async () => {
  const actual = await vi.importActual<typeof import("@services/runtime")>(
    "@services/runtime",
  );
  return {
    ...actual,
    isWebRuntime: isWebRuntimeMock,
  };
});

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: menuNew },
  MenuItem: { new: menuItemNew },
  PredefinedMenuItem: { new: predefinedMenuItemNew },
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => path,
}));

vi.mock("../../../services/tauri", () => ({
  readWorkspaceFile: vi.fn(),
}));

vi.mock("../../../services/openers", () => ({
  revealPathInFileManager: vi.fn(),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: `row-${index}`,
        index,
        start: index * 28,
      })),
    getTotalSize: () => count * 28,
    measureElement: () => {},
  }),
}));

describe("FileTreePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isWebRuntimeMock.mockReturnValue(true);
  });

  it("opens a web context menu for file rows", async () => {
    const onInsertText = vi.fn();
    render(
      <FileTreePanel
        workspaceId="ws-1"
        workspacePath="/tmp/repo"
        files={["src/App.tsx"]}
        modifiedFiles={[]}
        isLoading={false}
        filePanelMode="files"
        onFilePanelModeChange={vi.fn()}
        onInsertText={onInsertText}
        canInsertText
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: /^App\.tsx$/i }));

    expect(menuNew).not.toHaveBeenCalled();
    const addItem = await screen.findByRole("menuitem", { name: "Add to chat" });
    fireEvent.click(addItem);

    expect(onInsertText).toHaveBeenCalledWith("src/App.tsx");
  });
});
