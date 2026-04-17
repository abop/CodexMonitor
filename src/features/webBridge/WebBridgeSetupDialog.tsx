import { useState } from "react";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import { useWebBridge } from "./WebBridgeProvider";

export function WebBridgeSetupDialog() {
  const {
    seedBridgeUrl,
    warning,
    error,
    status,
    saveFirstBridge,
  } = useWebBridge();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState(seedBridgeUrl ?? "");

  return (
    <ModalShell ariaLabel="Connect a Bridge">
      <form
        className="web-bridge-setup"
        onSubmit={async (event) => {
          event.preventDefault();
          await saveFirstBridge({ name, baseUrl });
        }}
      >
        <h2>Connect a Bridge</h2>
        <label htmlFor="web-bridge-name">Name</label>
        <input
          id="web-bridge-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />

        <label htmlFor="web-bridge-url">Bridge URL</label>
        <input
          id="web-bridge-url"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          autoComplete="off"
        />

        {warning ? <div role="status">{warning}</div> : null}
        {error ? <div role="alert">{error}</div> : null}

        <button type="submit" disabled={status === "testing"}>
          {status === "testing" ? "Testing..." : "Test and Save"}
        </button>
      </form>
    </ModalShell>
  );
}
