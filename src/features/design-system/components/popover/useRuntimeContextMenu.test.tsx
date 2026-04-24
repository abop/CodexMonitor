/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeContextMenuController } from "./useRuntimeContextMenu";
import { useRuntimeContextMenu } from "./useRuntimeContextMenu";

const isWebRuntimeMock = vi.hoisted(() => vi.fn(() => true));
const menuNew = vi.hoisted(() =>
  vi.fn(async ({ items }) => ({ popup: vi.fn(), items })),
);
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

function Harness({ onReady }: { onReady: (api: RuntimeContextMenuController) => void }) {
  const contextMenu = useRuntimeContextMenu({ width: 220 });
  onReady(contextMenu);
  return <>{contextMenu.menuNode}</>;
}

function makeMouseEvent() {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientX: 12,
    clientY: 34,
  } as never;
}

describe("useRuntimeContextMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isWebRuntimeMock.mockReturnValue(true);
  });

  it("renders a page menu in web runtime and runs item actions", async () => {
    let api: RuntimeContextMenuController | null = null;
    const action = vi.fn();
    render(<Harness onReady={(next) => (api = next)} />);

    await act(async () => {
      await api?.showContextMenu(makeMouseEvent(), [
        { id: "open", text: "Open", action },
        { id: "copy", text: "Copy", enabled: false, action: vi.fn() },
      ]);
    });

    expect(menuNew).not.toHaveBeenCalled();
    const openItem = screen.getByRole("menuitem", { name: "Open" });
    expect(
      (screen.getByRole("menuitem", { name: "Copy" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(openItem);

    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("uses native menu items in desktop runtime", async () => {
    isWebRuntimeMock.mockReturnValue(false);
    let api: RuntimeContextMenuController | null = null;
    const action = vi.fn();
    render(<Harness onReady={(next) => (api = next)} />);

    await act(async () => {
      await api?.showContextMenu(makeMouseEvent(), [
        { id: "copy", text: "Copy", action },
        { id: "separator", kind: "separator" },
        { id: "services", kind: "services" },
      ]);
    });

    expect(menuItemNew).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Copy", action }),
    );
    expect(predefinedMenuItemNew).toHaveBeenCalledWith({ item: "Separator" });
    expect(predefinedMenuItemNew).toHaveBeenCalledWith({ item: "Services" });
    expect(menuNew).toHaveBeenCalledTimes(1);
  });
});
