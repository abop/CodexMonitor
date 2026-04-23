import Pencil from "lucide-react/dist/esm/icons/pencil";
import Plus from "lucide-react/dist/esm/icons/plus";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Server from "lucide-react/dist/esm/icons/server";
import Settings from "lucide-react/dist/esm/icons/settings";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import User from "lucide-react/dist/esm/icons/user";
import X from "lucide-react/dist/esm/icons/x";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  deleteRuntimeWebBackend,
  listRuntimeWebBackends,
  readRuntimeConfig,
  setActiveRuntimeWebBackend,
  subscribeRuntimeBackendBaseUrl,
  type RuntimeWebBackend,
  upsertRuntimeWebBackend,
} from "@services/runtime";
import {
  MenuTrigger,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useMenuController } from "../hooks/useMenuController";

type SidebarBottomRailProps = {
  sessionPercent: number | null;
  weeklyPercent: number | null;
  sessionResetLabel: string | null;
  weeklyResetLabel: string | null;
  creditsLabel: string | null;
  showWeekly: boolean;
  onOpenSettings: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
  showAccountSwitcher: boolean;
  accountLabel: string;
  accountActionLabel: string;
  accountDisabled: boolean;
  accountSwitching: boolean;
  accountCancelDisabled: boolean;
  onSwitchAccount: () => void;
  onCancelSwitchAccount: () => void;
};

type UsageRowProps = {
  label: string;
  percent: number | null;
  resetLabel: string | null;
};

type WebBackendDraft = {
  id: string | null;
  name: string;
  baseUrl: string;
  token: string;
};

function createWebBackendDraft(backend?: RuntimeWebBackend | null): WebBackendDraft {
  return {
    id: backend?.id ?? null,
    name: backend?.name ?? "",
    baseUrl: backend?.baseUrl ?? "",
    token: backend?.token ?? "",
  };
}

function UsageRow({ label, percent, resetLabel }: UsageRowProps) {
  return (
    <div className="sidebar-usage-row">
      <div className="sidebar-usage-row-head">
        <span className="sidebar-usage-name">{label}</span>
        <span className="sidebar-usage-value">
          {percent === null ? "--" : `${percent}%`}
        </span>
      </div>
      <div className="sidebar-usage-bar" aria-hidden>
        <span className="sidebar-usage-bar-fill" style={{ width: `${percent ?? 0}%` }} />
      </div>
      {resetLabel && <div className="sidebar-usage-reset">{resetLabel}</div>}
    </div>
  );
}

export function SidebarBottomRail({
  sessionPercent,
  weeklyPercent,
  sessionResetLabel,
  weeklyResetLabel,
  creditsLabel,
  showWeekly,
  onOpenSettings,
  onOpenDebug,
  showDebugButton,
  showAccountSwitcher,
  accountLabel,
  accountActionLabel,
  accountDisabled,
  accountSwitching,
  accountCancelDisabled,
  onSwitchAccount,
  onCancelSwitchAccount,
}: SidebarBottomRailProps) {
  const accountMenu = useMenuController();
  const webBackendMenu = useMenuController();
  const {
    isOpen: accountMenuOpen,
    containerRef: accountMenuRef,
    close: closeAccountMenu,
    toggle: toggleAccountMenu,
  } = accountMenu;
  const {
    isOpen: webBackendMenuOpen,
    containerRef: webBackendMenuRef,
    close: closeWebBackendMenu,
    toggle: toggleWebBackendMenu,
  } = webBackendMenu;
  const [runtimeConfig, setRuntimeConfig] = useState(() => readRuntimeConfig());
  const [webBackendDraft, setWebBackendDraft] = useState<WebBackendDraft | null>(null);
  const [webBackendError, setWebBackendError] = useState<string | null>(null);

  const savedWebBackends = listRuntimeWebBackends();
  const activeWebBackend = runtimeConfig.activeBackend;
  const showWebBackendManager = runtimeConfig.runtime === "web";

  useEffect(() => {
    if (!showAccountSwitcher) {
      closeAccountMenu();
    }
  }, [closeAccountMenu, showAccountSwitcher]);

  useEffect(() => {
    return subscribeRuntimeBackendBaseUrl(() => {
      setRuntimeConfig(readRuntimeConfig());
    });
  }, []);

  useEffect(() => {
    if (!showWebBackendManager) {
      closeWebBackendMenu();
      setWebBackendDraft(null);
      setWebBackendError(null);
    }
  }, [closeWebBackendMenu, showWebBackendManager]);

  const openAddWebBackendForm = () => {
    setWebBackendDraft(
      createWebBackendDraft(savedWebBackends.length === 0 ? activeWebBackend : null),
    );
    setWebBackendError(null);
  };

  const startEditingWebBackend = (backend: RuntimeWebBackend) => {
    setWebBackendDraft(createWebBackendDraft(backend));
    setWebBackendError(null);
  };

  const cancelEditingWebBackend = () => {
    setWebBackendDraft(null);
    setWebBackendError(null);
  };

  const saveWebBackend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!webBackendDraft) {
      return;
    }

    try {
      upsertRuntimeWebBackend(
        {
          id: webBackendDraft.id ?? undefined,
          name: webBackendDraft.name,
          baseUrl: webBackendDraft.baseUrl,
          token: webBackendDraft.token,
        },
        {
          activate:
            savedWebBackends.length === 0 ||
            activeWebBackend?.id === webBackendDraft.id,
        },
      );
      setWebBackendDraft(null);
      setWebBackendError(null);
    } catch (error) {
      setWebBackendError(
        error instanceof Error ? error.message : "Unable to save web backend.",
      );
    }
  };

  const activateWebBackend = (backendId: string) => {
    try {
      setActiveRuntimeWebBackend(backendId);
      setWebBackendError(null);
    } catch (error) {
      setWebBackendError(
        error instanceof Error ? error.message : "Unable to switch web backend.",
      );
    }
  };

  const removeWebBackend = (backendId: string) => {
    deleteRuntimeWebBackend(backendId);
    if (webBackendDraft?.id === backendId) {
      setWebBackendDraft(null);
    }
    setWebBackendError(null);
  };

  return (
    <div className="sidebar-bottom-rail">
      <div className="sidebar-usage-panel">
        <div className="sidebar-usage-header">
          <div className="sidebar-usage-kicker">Usage</div>
          {creditsLabel && <div className="sidebar-usage-credits">{creditsLabel}</div>}
        </div>
        <div className="sidebar-usage-list">
          <UsageRow
            label="Session"
            percent={sessionPercent}
            resetLabel={sessionResetLabel}
          />
          {showWeekly && (
            <UsageRow
              label="Weekly"
              percent={weeklyPercent}
              resetLabel={weeklyResetLabel}
            />
          )}
        </div>
      </div>
      <div
        className={`sidebar-bottom-actions${showAccountSwitcher ? "" : " is-compact"}`}
      >
        {showAccountSwitcher && (
          <div className="sidebar-account-menu" ref={accountMenuRef}>
            <MenuTrigger
              isOpen={accountMenuOpen}
              popupRole="dialog"
              className="ghost sidebar-labeled-button sidebar-account-trigger"
              activeClassName="is-open"
              onClick={toggleAccountMenu}
              aria-label="Account"
            >
              <span className="sidebar-account-trigger-content">
                <span className="sidebar-account-avatar" aria-hidden>
                  <User size={12} aria-hidden />
                </span>
                <span className="sidebar-account-trigger-label">Account</span>
              </span>
            </MenuTrigger>
            {accountMenuOpen && (
              <PopoverSurface className="sidebar-account-popover" role="dialog">
                <div className="sidebar-account-title">Account</div>
                <div className="sidebar-account-value">{accountLabel}</div>
                <div className="sidebar-account-actions-row">
                  <button
                    type="button"
                    className="primary sidebar-account-action"
                    onClick={onSwitchAccount}
                    disabled={accountDisabled}
                    aria-busy={accountSwitching}
                  >
                    <span className="sidebar-account-action-content">
                      {accountSwitching && (
                        <span className="sidebar-account-spinner" aria-hidden />
                      )}
                      <span>{accountActionLabel}</span>
                    </span>
                  </button>
                  {accountSwitching && (
                    <button
                      type="button"
                      className="secondary sidebar-account-cancel"
                      onClick={onCancelSwitchAccount}
                      disabled={accountCancelDisabled}
                      aria-label="Cancel account switch"
                      title="Cancel"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  )}
                </div>
              </PopoverSurface>
            )}
          </div>
        )}
        <div className="sidebar-utility-actions">
          <button
            className="ghost sidebar-labeled-button sidebar-utility-button"
            type="button"
            onClick={onOpenSettings}
            aria-label="Open settings"
          >
            <span className="sidebar-labeled-button-icon" aria-hidden>
              <Settings size={14} aria-hidden />
            </span>
            <span>Settings</span>
          </button>
          {showDebugButton && (
            <button
              className="ghost sidebar-utility-button"
              type="button"
              onClick={onOpenDebug}
              aria-label="Open debug log"
            >
              <ScrollText size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>
      {showWebBackendManager && (
        <div className="sidebar-web-backend-menu" ref={webBackendMenuRef}>
          <MenuTrigger
            isOpen={webBackendMenuOpen}
            popupRole="dialog"
            className="ghost sidebar-labeled-button sidebar-web-backend-trigger"
            activeClassName="is-open"
            onClick={toggleWebBackendMenu}
            aria-label="Web Backend"
          >
            <span className="sidebar-web-backend-trigger-content">
              <span className="sidebar-web-backend-avatar" aria-hidden>
                <Server size={12} aria-hidden />
              </span>
              <span className="sidebar-web-backend-trigger-copy">
                <span className="sidebar-web-backend-trigger-label">Web Backend</span>
                <span className="sidebar-web-backend-trigger-value">
                  {activeWebBackend?.name ?? "Not configured"}
                </span>
              </span>
            </span>
          </MenuTrigger>
          {webBackendMenuOpen && (
            <PopoverSurface className="sidebar-web-backend-popover" role="dialog">
              <div className="sidebar-web-backend-header">
                <div className="sidebar-account-title">Manage Web Backends</div>
                <button
                  type="button"
                  className="secondary sidebar-web-backend-add"
                  onClick={openAddWebBackendForm}
                >
                  <Plus size={12} aria-hidden />
                  <span>Add</span>
                </button>
              </div>
              <div className="sidebar-web-backend-current">
                {activeWebBackend?.name ?? "No backend selected"}
              </div>
              {savedWebBackends.length > 0 ? (
                <div className="sidebar-web-backend-list">
                  {savedWebBackends.map((backend) => {
                    const isActive = activeWebBackend?.id === backend.id;
                    return (
                      <div
                        key={backend.id}
                        className={`sidebar-web-backend-row${isActive ? " is-active" : ""}`}
                      >
                        <div className="sidebar-web-backend-row-copy">
                          <div className="sidebar-web-backend-row-name">{backend.name}</div>
                          <div className="sidebar-web-backend-row-url">{backend.baseUrl}</div>
                        </div>
                        <div className="sidebar-web-backend-row-actions">
                          {isActive ? (
                            <span className="sidebar-web-backend-badge">Active</span>
                          ) : (
                            <button
                              type="button"
                              className="secondary sidebar-web-backend-row-button"
                              onClick={() => activateWebBackend(backend.id)}
                            >
                              Use
                            </button>
                          )}
                          <button
                            type="button"
                            className="ghost sidebar-web-backend-icon-button"
                            onClick={() => startEditingWebBackend(backend)}
                            aria-label={`Edit ${backend.name}`}
                          >
                            <Pencil size={12} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="ghost sidebar-web-backend-icon-button"
                            onClick={() => removeWebBackend(backend.id)}
                            aria-label={`Delete ${backend.name}`}
                          >
                            <Trash2 size={12} aria-hidden />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="sidebar-web-backend-empty">
                  No saved web backends yet.
                </div>
              )}

              {webBackendDraft && (
                <form className="sidebar-web-backend-form" onSubmit={saveWebBackend}>
                  <div className="sidebar-web-backend-form-title">
                    {webBackendDraft.id ? "Edit Web Backend" : "Add Web Backend"}
                  </div>
                  <label className="sidebar-web-backend-field">
                    <span>Backend name</span>
                    <input
                      aria-label="Web backend name"
                      type="text"
                      value={webBackendDraft.name}
                      onChange={(event) => {
                        setWebBackendDraft((current) =>
                          current
                            ? {
                                ...current,
                                name: event.target.value,
                              }
                            : current,
                        );
                      }}
                    />
                  </label>
                  <label className="sidebar-web-backend-field">
                    <span>Backend URL</span>
                    <input
                      aria-label="Web backend URL"
                      type="url"
                      value={webBackendDraft.baseUrl}
                      onChange={(event) => {
                        setWebBackendDraft((current) =>
                          current
                            ? {
                                ...current,
                                baseUrl: event.target.value,
                              }
                            : current,
                        );
                      }}
                    />
                  </label>
                  <label className="sidebar-web-backend-field">
                    <span>Access token (optional)</span>
                    <input
                      aria-label="Web backend access token"
                      type="password"
                      value={webBackendDraft.token}
                      onChange={(event) => {
                        setWebBackendDraft((current) =>
                          current
                            ? {
                                ...current,
                                token: event.target.value,
                              }
                            : current,
                        );
                      }}
                    />
                  </label>
                  {webBackendError && (
                    <div className="sidebar-web-backend-error" role="alert">
                      {webBackendError}
                    </div>
                  )}
                  <div className="sidebar-web-backend-form-actions">
                    <button type="submit" className="primary sidebar-web-backend-save">
                      {webBackendDraft.id ? "Save" : "Add backend"}
                    </button>
                    <button
                      type="button"
                      className="secondary sidebar-web-backend-cancel"
                      onClick={cancelEditingWebBackend}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </PopoverSurface>
          )}
        </div>
      )}
    </div>
  );
}
