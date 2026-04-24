import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isWebRuntime } from "@services/runtime";
import { useDismissibleMenu } from "../../../app/hooks/useDismissibleMenu";
import { PopoverMenuItem, PopoverSurface } from "./PopoverPrimitives";

export type RuntimeContextMenuActionItem = {
  id: string;
  text: string;
  enabled?: boolean;
  action?: () => void | Promise<void>;
};

export type RuntimeContextMenuSpecialItem = {
  id: string;
  kind: "separator" | "services";
};

export type RuntimeContextMenuItem =
  | RuntimeContextMenuActionItem
  | RuntimeContextMenuSpecialItem;

export type RuntimeContextMenuController = {
  showContextMenu: (
    event: Pick<MouseEvent, "preventDefault" | "stopPropagation" | "clientX" | "clientY">,
    items: RuntimeContextMenuItem[],
  ) => Promise<void>;
  closeContextMenu: () => void;
  menuNode: ReactNode;
};

type RuntimeContextMenuState = {
  top: number;
  left: number;
  width: number;
  items: RuntimeContextMenuItem[];
};

type UseRuntimeContextMenuOptions = {
  width?: number;
  className?: string;
};

const DEFAULT_CONTEXT_MENU_WIDTH = 190;
const MENU_MARGIN = 8;

function isActionItem(item: RuntimeContextMenuItem): item is RuntimeContextMenuActionItem {
  return "text" in item;
}

function resolvePosition(
  event: Pick<MouseEvent, "clientX" | "clientY">,
  width: number,
) {
  const maxLeft =
    typeof window === "undefined"
      ? event.clientX
      : Math.max(MENU_MARGIN, window.innerWidth - width - MENU_MARGIN);
  const maxTop =
    typeof window === "undefined"
      ? event.clientY
      : Math.max(MENU_MARGIN, window.innerHeight - MENU_MARGIN);
  return {
    left: Math.min(Math.max(event.clientX, MENU_MARGIN), maxLeft),
    top: Math.min(Math.max(event.clientY, MENU_MARGIN), maxTop),
  };
}

async function createNativeItem(item: RuntimeContextMenuItem) {
  if (!isActionItem(item)) {
    return PredefinedMenuItem.new({
      item: item.kind === "separator" ? "Separator" : "Services",
    });
  }
  return MenuItem.new({
    text: item.text,
    enabled: item.enabled,
    action: item.action,
  });
}

export function useRuntimeContextMenu({
  width = DEFAULT_CONTEXT_MENU_WIDTH,
  className,
}: UseRuntimeContextMenuOptions = {}): RuntimeContextMenuController {
  const [contextMenu, setContextMenu] = useState<RuntimeContextMenuState | null>(
    null,
  );
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useDismissibleMenu({
    isOpen: Boolean(contextMenu),
    containerRef: contextMenuRef,
    onClose: closeContextMenu,
  });

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const handleScroll = () => setContextMenu(null);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [contextMenu]);

  const showContextMenu = useCallback(
    async (
      event: Pick<MouseEvent, "preventDefault" | "stopPropagation" | "clientX" | "clientY">,
      items: RuntimeContextMenuItem[],
    ) => {
      event.preventDefault();
      event.stopPropagation();

      if (isWebRuntime()) {
        setContextMenu({
          ...resolvePosition(event, width),
          width,
          items,
        });
        return;
      }

      const nativeItems = await Promise.all(items.map(createNativeItem));
      const menu = await Menu.new({ items: nativeItems });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [width],
  );

  const menuNode =
    contextMenu && typeof document !== "undefined"
      ? createPortal(
          <PopoverSurface
            className={["workspace-add-menu", className].filter(Boolean).join(" ")}
            role="menu"
            ref={contextMenuRef}
            style={{
              top: contextMenu.top,
              left: contextMenu.left,
              width: contextMenu.width,
            }}
          >
            {contextMenu.items.filter(isActionItem).map((item) => (
              <PopoverMenuItem
                key={item.id}
                className="workspace-add-option"
                role="menuitem"
                disabled={item.enabled === false}
                onClick={(event) => {
                  event.stopPropagation();
                  closeContextMenu();
                  void item.action?.();
                }}
              >
                {item.text}
              </PopoverMenuItem>
            ))}
          </PopoverSurface>,
          document.body,
        )
      : null;

  return {
    showContextMenu,
    closeContextMenu,
    menuNode,
  };
}
