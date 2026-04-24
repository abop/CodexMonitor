/** @vitest-environment jsdom */
import type { MouseEvent as ReactMouseEvent } from "react";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceInfo } from "../../../types";
import { useSidebarMenus } from "./useSidebarMenus";
import { fileManagerName } from "../../../utils/platformPaths";
import { WEB_LOCAL_PATH_UNSUPPORTED_MESSAGE } from "../../../services/runtimeErrors";

const isWebRuntimeMock = vi.hoisted(() => vi.fn(() => false));
const menuNew = vi.hoisted(() =>
  vi.fn(async ({ items }) => ({ popup: vi.fn(), items })),
);
const menuItemNew = vi.hoisted(() => vi.fn(async (options) => options));
const predefinedMenuItemNew = vi.hoisted(() => vi.fn(async (options) => options));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: menuNew },
  MenuItem: { new: menuItemNew },
  PredefinedMenuItem: { new: predefinedMenuItemNew },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ scaleFactor: () => 1 }),
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

const revealItemInDir = vi.hoisted(() => vi.fn());
const pushErrorToast = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: (...args: unknown[]) => revealItemInDir(...args),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: (...args: unknown[]) => pushErrorToast(...args),
}));

vi.mock("@services/runtime", async () => {
  const actual = await vi.importActual<typeof import("@services/runtime")>(
    "@services/runtime",
  );
  return {
    ...actual,
    isWebRuntime: isWebRuntimeMock,
  };
});

type SidebarMenusApi = ReturnType<typeof useSidebarMenus>;

function createHandlers() {
  return {
    onDeleteThread: vi.fn(),
    onSyncThread: vi.fn(),
    onPinThread: vi.fn(),
    onUnpinThread: vi.fn(),
    isThreadPinned: vi.fn(() => false),
    onRenameThread: vi.fn(),
    onReloadWorkspaceThreads: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onDeleteWorktree: vi.fn(),
  };
}

function SidebarMenuHarness({
  handlers,
  onReady,
}: {
  handlers: Parameters<typeof useSidebarMenus>[0];
  onReady: (api: SidebarMenusApi) => void;
}) {
  const api = useSidebarMenus(handlers);
  onReady(api);
  return <>{api.sidebarContextMenu}</>;
}

function makeMenuEvent() {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientX: 12,
    clientY: 34,
  } as unknown as ReactMouseEvent;
}

describe("useSidebarMenus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isWebRuntimeMock.mockReturnValue(false);
  });

  it("adds a show in file manager option for worktrees", async () => {
    const handlers = createHandlers();

    const { result } = renderHook(() =>
      useSidebarMenus(handlers),
    );

    const worktree: WorkspaceInfo = {
      id: "worktree-1",
      name: "feature/test",
      path: "/tmp/worktree-1",
      kind: "worktree",
      connected: true,
      settings: {
        sidebarCollapsed: false,
        worktreeSetupScript: "",
      },
      worktree: { branch: "feature/test" },
    };

    await result.current.showWorktreeMenu(makeMenuEvent(), worktree);

    const menuArgs = menuNew.mock.calls[0]?.[0];
    const revealItem = menuArgs.items.find(
      (item: { text: string }) => item.text === `Show in ${fileManagerName()}`,
    );

    expect(revealItem).toBeDefined();
    await revealItem.action();
    expect(revealItemInDir).toHaveBeenCalledWith("/tmp/worktree-1");
  });

  it("opens a web context menu for thread rows in web runtime", async () => {
    isWebRuntimeMock.mockReturnValue(true);
    const handlers = createHandlers();
    let api: SidebarMenusApi | null = null;
    render(
      <SidebarMenuHarness
        handlers={handlers}
        onReady={(next) => {
          api = next;
        }}
      />,
    );

    await act(async () => {
      await api?.showThreadMenu(makeMenuEvent(), "ws-1", "thread-1", true);
    });

    expect(menuNew).not.toHaveBeenCalled();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Sync from server" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Pin" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Copy ID" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Archive" })).toBeTruthy();
  });

  it("shows unsupported feedback for web worktree file manager actions", async () => {
    isWebRuntimeMock.mockReturnValue(true);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const handlers = createHandlers();
    let api: SidebarMenusApi | null = null;
    render(
      <SidebarMenuHarness
        handlers={handlers}
        onReady={(next) => {
          api = next;
        }}
      />,
    );

    const worktree: WorkspaceInfo = {
      id: "worktree-1",
      name: "feature/test",
      path: "/tmp/worktree-1",
      kind: "worktree",
      connected: true,
      settings: {
        sidebarCollapsed: false,
        worktreeSetupScript: "",
      },
      worktree: { branch: "feature/test" },
    };

    await act(async () => {
      await api?.showWorktreeMenu(makeMenuEvent(), worktree);
    });

    fireEvent.click(
      screen.getByRole("menuitem", { name: `Show in ${fileManagerName()}` }),
    );

    expect(revealItemInDir).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(pushErrorToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: WEB_LOCAL_PATH_UNSUPPORTED_MESSAGE,
        }),
      );
    });
    warnSpy.mockRestore();
  });
});
