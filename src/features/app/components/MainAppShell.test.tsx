/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MainAppShell } from "./MainAppShell";

vi.mock("@/features/webBridge", () => ({
  WebBridgeSwitcher: () => <div data-testid="web-bridge-switcher" />,
}));

vi.mock("@app/components/AppLayout", () => ({
  AppLayout: () => <div data-testid="app-layout" />,
}));

vi.mock("@app/components/AppModals", () => ({
  AppModals: () => <div data-testid="app-modals" />,
}));

vi.mock("@/features/layout/components/SidebarToggleControls", () => ({
  TitlebarExpandControls: () => <div data-testid="titlebar-expand-controls" />,
}));

vi.mock("@/features/layout/components/WindowCaptionControls", () => ({
  WindowCaptionControls: () => <div data-testid="window-caption-controls" />,
}));

vi.mock("@/features/mobile/components/MobileServerSetupWizard", () => ({
  MobileServerSetupWizard: () => <div data-testid="mobile-setup-wizard" />,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const buildProps = (overrides: Partial<ComponentProps<typeof MainAppShell>> = {}) =>
  ({
    appClassName: "app-shell",
    isResizing: false,
    appStyle: {},
    appRef: { current: null },
    sidebarToggleProps: {
      isCompact: false,
      sidebarCollapsed: false,
      rightPanelCollapsed: false,
      onCollapseSidebar: vi.fn(),
      onExpandSidebar: vi.fn(),
      onCollapseRightPanel: vi.fn(),
      onExpandRightPanel: vi.fn(),
    },
    shouldLoadGitHubPanelData: false,
    gitHubPanelDataProps: {
      activeWorkspace: null,
      gitPanelMode: "hidden",
      shouldLoadDiffs: false,
      diffSource: null,
      selectedPullRequestNumber: null,
      onIssuesChange: vi.fn(),
      onPullRequestsChange: vi.fn(),
      onPullRequestDiffsChange: vi.fn(),
      onPullRequestCommentsChange: vi.fn(),
    },
    appLayoutProps: {},
    appModalsProps: {
      approvalRequests: [],
      requestUserInputRequests: [],
      settingsOpen: false,
      settingsSection: null,
      settingsProps: {
        workspaceGroups: [],
        groupedWorkspaces: [],
        ungroupedLabel: "Ungrouped",
        onClose: vi.fn(),
        onMoveWorkspace: vi.fn(),
        onDeleteWorkspace: vi.fn(),
        onCreateWorkspaceGroup: vi.fn().mockResolvedValue(null),
        onRenameWorkspaceGroup: vi.fn().mockResolvedValue(null),
        onMoveWorkspaceGroup: vi.fn().mockResolvedValue(null),
        onDeleteWorkspaceGroup: vi.fn().mockResolvedValue(null),
        onAssignWorkspaceGroup: vi.fn().mockResolvedValue(null),
        reduceTransparency: false,
        onToggleTransparency: vi.fn(),
        appSettings: {
          codexBin: null,
          codexArgs: null,
          backendMode: "local",
          remoteBackendProvider: "tcp",
          remoteBackendHost: "127.0.0.1:4732",
          remoteBackendToken: null,
          remoteBackends: [],
          activeRemoteBackendId: null,
          keepDaemonRunningAfterAppClose: false,
          defaultAccessMode: "current",
          reviewDeliveryMode: "inline",
          composerModelShortcut: null,
          composerAccessShortcut: null,
          composerReasoningShortcut: null,
          composerCollaborationShortcut: null,
          interruptShortcut: null,
          newAgentShortcut: null,
          newWorktreeAgentShortcut: null,
          newCloneAgentShortcut: null,
          archiveThreadShortcut: null,
          toggleProjectsSidebarShortcut: null,
          toggleGitSidebarShortcut: null,
          branchSwitcherShortcut: null,
          toggleDebugPanelShortcut: null,
          toggleTerminalShortcut: null,
          cycleAgentNextShortcut: null,
          cycleAgentPrevShortcut: null,
          cycleWorkspaceNextShortcut: null,
          cycleWorkspacePrevShortcut: null,
          lastComposerModelId: null,
          lastComposerReasoningEffort: null,
          uiScale: 1,
          theme: "system",
          usageShowRemaining: false,
          showMessageFilePath: true,
          chatHistoryScrollbackItems: 200,
          threadTitleAutogenerationEnabled: false,
          automaticAppUpdateChecksEnabled: true,
          uiFontFamily: "system-ui",
          codeFontFamily: "monospace",
          codeFontSize: 11,
          notificationSoundsEnabled: true,
          systemNotificationsEnabled: true,
          subagentSystemNotificationsEnabled: true,
          splitChatDiffView: false,
          preloadGitDiffs: true,
          gitDiffIgnoreWhitespaceChanges: false,
          commitMessagePrompt: "",
          commitMessageModelId: null,
          collaborationModesEnabled: true,
          steerEnabled: true,
          followUpMessageBehavior: "queue",
          composerFollowUpHintEnabled: true,
          pauseQueuedMessagesWhenResponseRequired: true,
          unifiedExecEnabled: true,
          experimentalAppsEnabled: false,
          personality: "friendly",
          dictationEnabled: false,
          dictationModelId: "base",
          dictationPreferredLanguage: null,
          dictationHoldKey: null,
          composerEditorPreset: "default",
          composerFenceExpandOnSpace: false,
          composerFenceExpandOnEnter: false,
          composerFenceLanguageTags: false,
          composerFenceWrapSelection: false,
          composerFenceAutoWrapPasteMultiline: false,
          composerFenceAutoWrapPasteCodeLike: false,
          composerListContinuation: false,
          composerCodeBlockCopyUseModifier: false,
          workspaceGroups: [],
          openAppTargets: [],
          selectedOpenAppId: "vscode",
          globalWorktreesFolder: null,
        },
        openAppIconById: {},
        onUpdateAppSettings: vi.fn().mockResolvedValue(undefined),
        onRunDoctor: vi.fn().mockResolvedValue({
          ok: true,
          codexBin: null,
          version: null,
          appServerOk: true,
          details: null,
          path: null,
          nodeOk: true,
          nodeVersion: null,
          nodeDetails: null,
        }),
        onUpdateWorkspaceSettings: vi.fn().mockResolvedValue(undefined),
        scaleShortcutTitle: "Scale shortcut",
        scaleShortcutText: "Use Command +/-",
        onTestNotificationSound: vi.fn(),
        onTestSystemNotification: vi.fn(),
        dictationModelStatus: null,
      },
      onRequestApproval: vi.fn(),
      onDismissApprovalRequest: vi.fn(),
      onRequestUserInput: vi.fn(),
      onDismissRequestUserInput: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenWorkspaceFromTray: vi.fn(),
      onOpenThreadFromTray: vi.fn(),
      onOpenNotification: vi.fn(),
      onCloseSettings: vi.fn(),
      onCancelSettings: vi.fn(),
      onShowSettings: vi.fn(),
      onOpenAppSettings: vi.fn(),
      onOpenDebugPanel: vi.fn(),
      onOpenTerminal: vi.fn(),
      onCloseTerminal: vi.fn(),
      onToggleTerminal: vi.fn(),
      onCopyDebugEntries: vi.fn(),
      onClearDebugEntries: vi.fn(),
      onDismissUpdateToast: vi.fn(),
      onUpdateStart: vi.fn(),
      onToggleDebugPanel: vi.fn(),
      onToggleShowDebugPanel: vi.fn(),
      onToggleShowTerminalPanel: vi.fn(),
      onOpenGitHubPanel: vi.fn(),
      onCloseGitHubPanel: vi.fn(),
      onToggleSidebar: vi.fn(),
      onToggleRightPanel: vi.fn(),
      onShowWorkspaceDetails: vi.fn(),
      onHideWorkspaceDetails: vi.fn(),
      onShowThreadDetails: vi.fn(),
      onHideThreadDetails: vi.fn(),
      onShowSettingsSection: vi.fn(),
      onOpenWorkspaceSettings: vi.fn(),
    },
    showMobileSetupWizard: false,
    mobileSetupWizardProps: {},
    ...overrides,
  }) as ComponentProps<typeof MainAppShell>;

describe("MainAppShell", () => {
  it("renders desktop shell chrome outside the web build", () => {
    const { container } = render(<MainAppShell {...buildProps()} />);

    expect(screen.getByTestId("titlebar-expand-controls")).toBeTruthy();
    expect(screen.getByTestId("window-caption-controls")).toBeTruthy();
    expect(container.querySelector(".drag-strip")).not.toBeNull();
  });

  it("hides desktop shell chrome in the web build", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    const { container } = render(<MainAppShell {...buildProps()} />);

    expect(container.querySelector(".drag-strip")).toBeNull();
    expect(container.querySelector("[data-testid='titlebar-expand-controls']")).toBeNull();
    expect(container.querySelector("[data-testid='window-caption-controls']")).toBeNull();
    expect(screen.getByTestId("app-layout")).toBeTruthy();
    expect(screen.getByTestId("app-modals")).toBeTruthy();
  });

  it("renders the web bridge switcher in web runtime", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    render(<MainAppShell {...buildProps()} />);

    const chrome = document.querySelector(".web-bridge-chrome");
    expect(chrome).toBeTruthy();
    expect(screen.getByTestId("web-bridge-switcher")).toBeTruthy();
  });

  it("does not render the web bridge switcher in desktop runtime", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "desktop");

    render(<MainAppShell {...buildProps()} />);

    expect(document.querySelector(".web-bridge-chrome")).toBeNull();
    expect(screen.queryByTestId("web-bridge-switcher")).toBeNull();
  });
});
