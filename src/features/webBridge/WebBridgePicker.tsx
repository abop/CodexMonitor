import type { WebBridgeTarget } from "./types";

type WebBridgePickerProps = {
  bridges: WebBridgeTarget[];
  activeBridgeId: string | null;
  status: "idle" | "testing" | "switching";
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onManage: () => void;
};

export function WebBridgePicker({
  bridges,
  activeBridgeId,
  status,
  onSwitch,
  onAdd,
  onManage,
}: WebBridgePickerProps) {
  const disabled = status !== "idle";

  return (
    <div className="web-bridge-picker" role="menu" aria-label="Select Bridge">
      <div className="web-bridge-picker-title">Select Bridge</div>
      <div className="web-bridge-picker-list">
        {bridges.map((bridge) => {
          const active = bridge.id === activeBridgeId;
          return (
            <button
              key={bridge.id}
              type="button"
              className="web-bridge-row"
              disabled={disabled || active}
              onClick={() => onSwitch(bridge.id)}
            >
              <span className="web-bridge-row-marker" aria-hidden>
                {active ? "*" : ""}
              </span>
              <span className="web-bridge-row-copy">
                <span className="web-bridge-row-name">
                  {bridge.name}
                  {active ? " (Current)" : ""}
                </span>
                <span className="web-bridge-row-url">{bridge.baseUrl}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="web-bridge-picker-actions">
        <button
          type="button"
          className="web-bridge-action-button web-bridge-action-button-secondary"
          disabled={disabled}
          onClick={onAdd}
        >
          Add Bridge
        </button>
        <button
          type="button"
          className="web-bridge-action-button web-bridge-action-button-secondary"
          disabled={disabled}
          onClick={onManage}
        >
          Manage Bridges
        </button>
      </div>
    </div>
  );
}
