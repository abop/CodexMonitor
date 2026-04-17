import { useMemo, useState } from "react";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import { useMenuController } from "@app/hooks/useMenuController";
import { PopoverSurface } from "@/features/design-system/components/popover/PopoverPrimitives";
import { joinClassNames } from "@/features/design-system/components/classNames";
import { useWebBridge } from "./WebBridgeProvider";
import { WebBridgeManager } from "./WebBridgeManager";
import { WebBridgePicker } from "./WebBridgePicker";

function isMobileWebBridgeSheet() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(max-width: 700px)").matches;
}

export function WebBridgeSwitcher() {
  const {
    isWeb,
    activeBridge,
    bridges,
    status,
    error,
    warning,
    switchBridge,
    addBridge,
    editBridge,
    deleteBridge,
  } = useWebBridge();
  const menu = useMenuController();
  const [managerOpen, setManagerOpen] = useState(false);
  const [managerMode, setManagerMode] = useState<"list" | "add">("list");

  const mobileSheet = useMemo(() => isMobileWebBridgeSheet(), []);

  if (!isWeb || !activeBridge) {
    return null;
  }

  const openManager = (mode: "list" | "add" = "list") => {
    setManagerMode(mode);
    setManagerOpen(true);
    menu.close();
  };

  const closeManager = () => {
    setManagerOpen(false);
    setManagerMode("list");
  };

  return (
    <div className="web-bridge-chrome">
      <div className="web-bridge-switcher" ref={menu.containerRef}>
        <button
          type="button"
          className={joinClassNames("web-bridge-trigger", menu.isOpen && "is-open")}
          aria-label={`Current Bridge: ${activeBridge.name}`}
          aria-haspopup="dialog"
          aria-expanded={menu.isOpen}
          onClick={menu.toggle}
        >
          <span className="web-bridge-trigger-label">{activeBridge.name}</span>
          <ChevronDown className="web-bridge-trigger-icon" aria-hidden size={14} />
        </button>

        {menu.isOpen ? (
          mobileSheet ? (
            <div className="web-bridge-sheet" role="dialog" aria-label="Select Bridge">
              <div className="web-bridge-sheet-backdrop" onClick={menu.close} />
              <div className="web-bridge-sheet-card">
                {error ? <div className="web-bridge-error">{error}</div> : null}
                {warning ? <div className="web-bridge-warning">{warning}</div> : null}
                <WebBridgePicker
                  bridges={bridges}
                  activeBridgeId={activeBridge.id}
                  status={status}
                  onSwitch={(id) => void switchBridge(id)}
                  onAdd={() => openManager("add")}
                  onManage={() => openManager("list")}
                />
              </div>
            </div>
          ) : (
            <PopoverSurface className="web-bridge-popover" role="dialog" aria-label="Select Bridge">
              {error ? <div className="web-bridge-error">{error}</div> : null}
              {warning ? <div className="web-bridge-warning">{warning}</div> : null}
              <WebBridgePicker
                bridges={bridges}
                activeBridgeId={activeBridge.id}
                status={status}
                onSwitch={(id) => void switchBridge(id)}
                onAdd={() => openManager("add")}
                onManage={() => openManager("list")}
              />
            </PopoverSurface>
          )
        ) : null}
      </div>

      {managerOpen ? (
        <WebBridgeManager
          bridges={bridges}
          activeBridgeId={activeBridge.id}
          status={status}
          error={error}
          warning={warning}
          onClose={closeManager}
          onAdd={async (draft) => {
            await addBridge({ ...draft, activate: false });
          }}
          onEdit={async (id, draft) => {
            await editBridge(id, draft);
          }}
          onDelete={async (id) => {
            await deleteBridge(id);
          }}
          initialMode={managerMode}
        />
      ) : null}
    </div>
  );
}
