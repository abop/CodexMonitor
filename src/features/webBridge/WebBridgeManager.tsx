import { useEffect, useMemo, useState } from "react";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import type { WebBridgeDraft, WebBridgeTarget } from "./types";

type WebBridgeManagerProps = {
  bridges: WebBridgeTarget[];
  activeBridgeId: string | null;
  status: "idle" | "testing" | "switching";
  error: string | null;
  warning: string | null;
  onClose: () => void;
  onAdd: (draft: WebBridgeDraft) => Promise<void>;
  onEdit: (id: string, draft: WebBridgeDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  initialMode?: "list" | "add";
};

type ManagerMode =
  | { type: "list" }
  | { type: "add" }
  | { type: "edit"; bridgeId: string };

export function WebBridgeManager({
  bridges,
  activeBridgeId,
  status,
  error,
  warning,
  onClose,
  onAdd,
  onEdit,
  onDelete,
  initialMode = "list",
}: WebBridgeManagerProps) {
  const [mode, setMode] = useState<ManagerMode>(initialMode === "add" ? { type: "add" } : { type: "list" });
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const editingBridge = useMemo(
    () => (mode.type === "edit" ? bridges.find((bridge) => bridge.id === mode.bridgeId) ?? null : null),
    [bridges, mode],
  );

  useEffect(() => {
    if (mode.type === "add") {
      setName("");
      setBaseUrl("");
      return;
    }
    if (mode.type === "edit" && editingBridge) {
      setName(editingBridge.name);
      setBaseUrl(editingBridge.baseUrl);
    }
  }, [editingBridge, mode]);

  useEffect(() => {
    if (!isSubmitting || status !== "idle") {
      return;
    }
    setIsSubmitting(false);
    if (!error) {
      setMode({ type: "list" });
    }
  }, [error, isSubmitting, status]);

  const busy = status !== "idle" || isSubmitting;
  return (
    <ModalShell ariaLabel="Manage Bridges" className="web-bridge-modal" onBackdropClick={onClose}>
      <div className="web-bridge-manager">
        <div className="web-bridge-manager-header">
          <div>
            <div className="ds-modal-title">Bridge Management</div>
            {mode.type === "list" ? (
              <div className="ds-modal-subtitle">Keep your bridge list current.</div>
            ) : (
              <div className="ds-modal-subtitle">
                {mode.type === "add" ? "Add a new bridge." : "Edit bridge details."}
              </div>
            )}
          </div>
          <button type="button" className="ghost ds-modal-button" onClick={onClose}>
            Close
          </button>
        </div>

        {warning ? <div className="web-bridge-warning">{warning}</div> : null}
        {error ? <div className="web-bridge-error">{error}</div> : null}

        {mode.type === "list" ? (
          <>
            <div className="web-bridge-manager-list">
              {bridges.map((bridge) => {
                const active = bridge.id === activeBridgeId;
                return (
                  <div key={bridge.id} className="web-bridge-manager-item">
                    <div className="web-bridge-manager-item-main">
                      <div className="web-bridge-manager-item-name">
                        {bridge.name}
                        {active ? " (Active)" : ""}
                      </div>
                      <div className="web-bridge-manager-item-url">{bridge.baseUrl}</div>
                    </div>
                    <div className="web-bridge-manager-item-actions">
                      <button type="button" disabled={busy} onClick={() => setMode({ type: "edit", bridgeId: bridge.id })}>
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy || bridges.length === 1}
                        onClick={() => void onDelete(bridge.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="web-bridge-manager-actions">
              <button type="button" disabled={busy} onClick={() => setMode({ type: "add" })}>
                Add Bridge
              </button>
            </div>
          </>
        ) : (
          <form
            className="web-bridge-manager-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setIsSubmitting(true);
              if (mode.type === "add") {
                await onAdd({ name, baseUrl });
                return;
              }
              await onEdit(mode.bridgeId, { name, baseUrl });
            }}
          >
            <label className="ds-modal-label web-bridge-manager-label" htmlFor="web-bridge-manager-name">
              Name
            </label>
            <input
              id="web-bridge-manager-name"
              className="ds-modal-input web-bridge-manager-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
              disabled={busy}
            />

            <label className="ds-modal-label web-bridge-manager-label" htmlFor="web-bridge-manager-url">
              Bridge URL
            </label>
            <input
              id="web-bridge-manager-url"
              className="ds-modal-input web-bridge-manager-input"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              autoComplete="off"
              disabled={busy}
            />

            <div className="web-bridge-manager-actions">
              <button type="button" disabled={busy} onClick={() => setMode({ type: "list" })}>
                Back
              </button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Testing..." : "Test and Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  );
}
