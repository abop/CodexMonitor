import { lazy, Suspense, useEffect, useState } from "react";
import "./styles/base.css";
import "./styles/ds-tokens.css";
import "./styles/ds-modal.css";
import "./styles/ds-toast.css";
import "./styles/ds-panel.css";
import "./styles/ds-diff.css";
import "./styles/ds-popover.css";
import "./styles/ds-tooltip.css";
import "./styles/buttons.css";
import "./styles/sidebar.css";
import "./styles/home.css";
import "./styles/workspace-home.css";
import "./styles/main.css";
import "./styles/messages.css";
import "./styles/approval-toasts.css";
import "./styles/error-toasts.css";
import "./styles/request-user-input.css";
import "./styles/update-toasts.css";
import "./styles/composer.css";
import "./styles/review-inline.css";
import "./styles/diff.css";
import "./styles/diff-viewer.css";
import "./styles/file-tree.css";
import "./styles/panel-tabs.css";
import "./styles/prompts.css";
import "./styles/debug.css";
import "./styles/terminal.css";
import "./styles/plan.css";
import "./styles/about.css";
import "./styles/tabbar.css";
import "./styles/worktree-modal.css";
import "./styles/clone-modal.css";
import "./styles/workspace-from-url-modal.css";
import "./styles/mobile-remote-workspace-modal.css";
import "./styles/branch-switcher-modal.css";
import "./styles/git-init-modal.css";
import "./styles/settings.css";
import "./styles/compact-base.css";
import "./styles/compact-phone.css";
import "./styles/compact-tablet.css";
import { useWindowLabel } from "@/features/layout/hooks/useWindowLabel";
import MainApp from "@app/components/MainApp";
import {
  readRuntimeConfig,
  setRuntimeBackendBaseUrl,
  subscribeRuntimeBackendBaseUrl,
} from "@services/runtime";

const AboutView = lazy(() =>
  import("@/features/about/components/AboutView").then((module) => ({
    default: module.AboutView,
  })),
);

function WebRuntimeSetupView() {
  const [backendUrl, setBackendUrl] = useState("");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px",
        background:
          "radial-gradient(circle at top, rgba(107, 142, 255, 0.18), transparent 42%), #0f172a",
        color: "#e2e8f0",
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setRuntimeBackendBaseUrl(backendUrl);
        }}
        style={{
          width: "min(560px, 100%)",
          display: "grid",
          gap: "16px",
          padding: "28px",
          borderRadius: "24px",
          background: "rgba(15, 23, 42, 0.92)",
          border: "1px solid rgba(148, 163, 184, 0.22)",
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.45)",
        }}
      >
        <div style={{ display: "grid", gap: "8px" }}>
          <div
            style={{
              fontSize: "0.8rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#93c5fd",
            }}
          >
            CodexMonitor Web
          </div>
          <h1 style={{ margin: 0, fontSize: "1.9rem", lineHeight: 1.1 }}>
            Connect Web Backend
          </h1>
          <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.6 }}>
            This browser runtime talks directly to the unified daemon backend.
            Enter the daemon base URL to continue.
          </p>
        </div>

        <label style={{ display: "grid", gap: "8px" }}>
          <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>Backend URL</span>
          <input
            aria-label="Backend URL"
            type="url"
            value={backendUrl}
            onChange={(event) => {
              setBackendUrl(event.target.value);
            }}
            placeholder="https://daemon.example.com"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "14px",
              border: "1px solid rgba(148, 163, 184, 0.28)",
              background: "rgba(15, 23, 42, 0.88)",
              color: "#e2e8f0",
              fontSize: "1rem",
            }}
          />
        </label>

        <div
          style={{
            fontSize: "0.92rem",
            color: "#94a3b8",
            lineHeight: 1.6,
          }}
        >
          Expected format: <code>https://host.example.com</code> or{" "}
          <code>http://127.0.0.1:4732</code>
        </div>

        <button
          type="submit"
          style={{
            justifySelf: "start",
            padding: "12px 18px",
            borderRadius: "999px",
            border: "none",
            background: "#38bdf8",
            color: "#082f49",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Connect
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const windowLabel = useWindowLabel();
  const [runtimeConfig, setRuntimeConfig] = useState(() => readRuntimeConfig());

  useEffect(() => {
    return subscribeRuntimeBackendBaseUrl(() => {
      setRuntimeConfig(readRuntimeConfig());
    });
  }, []);

  if (windowLabel === "about") {
    return (
      <Suspense fallback={null}>
        <AboutView />
      </Suspense>
    );
  }

  if (runtimeConfig.runtime === "web" && !runtimeConfig.backendBaseUrl) {
    return <WebRuntimeSetupView />;
  }

  return <MainApp />;
}
