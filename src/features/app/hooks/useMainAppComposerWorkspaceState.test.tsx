// @vitest-environment jsdom
import { createRef } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMainAppComposerWorkspaceState } from "./useMainAppComposerWorkspaceState";

vi.mock("@/features/messages/utils/messageRenderUtils", () => ({
  computePlanFollowupState: () => ({ shouldShow: false }),
}));

vi.mock("@app/hooks/useComposerController", () => ({
  useComposerController: () => ({
    activeDraft: "",
    handleDraftChange: vi.fn(),
  }),
}));

vi.mock("@app/hooks/useComposerInsert", () => ({
  useComposerInsert: () => vi.fn(),
}));

vi.mock("@app/hooks/useWorkspaceFileListing", () => ({
  useWorkspaceFileListing: () => ({
    files: [],
    isLoading: false,
    setFileAutocompleteActive: vi.fn(),
  }),
}));

vi.mock("@/features/workspaces/hooks/useWorkspaceAgentMd", () => ({
  useWorkspaceAgentMd: () => ({
    content: "",
    exists: false,
    truncated: false,
    loading: false,
    saving: false,
    error: null,
    dirty: false,
    setContent: vi.fn(),
    refresh: vi.fn(),
    save: vi.fn(),
  }),
}));

vi.mock("@/features/workspaces/hooks/useWorkspaceHome", () => ({
  useWorkspaceHome: () => ({
    draft: "",
    setDraft: vi.fn(),
  }),
}));

function buildArgs(overrides?: {
  activeTurnId?: string | null;
  steerEnabled?: boolean;
  steerCapability?: boolean;
}) {
  const composerInputRef = createRef<HTMLTextAreaElement>();
  const workspaceHomeTextareaRef = createRef<HTMLTextAreaElement>();

  return {
    view: {
      centerMode: "chat" as const,
      isCompact: false,
      isTablet: false,
      activeTab: "codex" as const,
      tabletTab: "codex" as const,
      filePanelMode: "files" as const,
      rightPanelCollapsed: false,
    },
    workspace: {
      activeWorkspace: {
        id: "ws-1",
        name: "Workspace",
        path: "/tmp/workspace",
        connected: true,
        kind: "main" as const,
        settings: {
          sidebarCollapsed: false,
        },
      },
      activeWorkspaceId: "ws-1",
      isNewAgentDraftMode: false,
      startingDraftThreadWorkspaceId: null,
      threadsByWorkspace: {},
    },
    thread: {
      activeThreadId: "thread-1",
      activeItems: [],
      activeTurnIdByThread: {
        "thread-1":
          overrides && "activeTurnId" in overrides ? overrides.activeTurnId : "turn-1",
      },
      threadStatusById: {
        "thread-1": {
          isProcessing: false,
          isReviewing: false,
        },
      },
      userInputRequests: [],
    },
    runtimeCapabilities: {
      threadControls: {
        steer: overrides?.steerCapability ?? true,
        fork: true,
        compact: true,
        review: true,
        mcp: true,
      },
    },
    settings: {
      steerEnabled: overrides?.steerEnabled ?? true,
      followUpMessageBehavior: "queue" as const,
      experimentalAppsEnabled: true,
      pauseQueuedMessagesWhenResponseRequired: false,
    },
    models: {
      models: [],
      selectedModelId: null,
      resolvedEffort: null,
      selectedServiceTier: null,
      collaborationModePayload: null,
    },
    refs: {
      composerInputRef,
      workspaceHomeTextareaRef,
    },
    actions: {
      addWorktreeAgent: vi.fn(),
      connectWorkspace: vi.fn(),
      startThreadForWorkspace: vi.fn(),
      sendUserMessage: vi.fn(),
      sendUserMessageToThread: vi.fn(),
      seedThreadCodexParams: vi.fn(),
      startFork: vi.fn(),
      startReview: vi.fn(),
      startResume: vi.fn(),
      startCompact: vi.fn(),
      startApps: vi.fn(),
      startMcp: vi.fn(),
      startFast: vi.fn(),
      startStatus: vi.fn(),
      handleWorktreeCreated: vi.fn(),
      addDebugEntry: vi.fn(),
    },
  };
}

describe("useMainAppComposerWorkspaceState", () => {
  it("requires settings, an active turn, and runtime steer capability for steerAvailable", () => {
    const { result: enabled } = renderHook(() =>
      useMainAppComposerWorkspaceState(buildArgs()),
    );
    const { result: disabledBySetting } = renderHook(() =>
      useMainAppComposerWorkspaceState(buildArgs({ steerEnabled: false })),
    );
    const { result: disabledByTurn } = renderHook(() =>
      useMainAppComposerWorkspaceState(buildArgs({ activeTurnId: null })),
    );
    const { result: disabledByCapability } = renderHook(() =>
      useMainAppComposerWorkspaceState(buildArgs({ steerCapability: false })),
    );

    expect(enabled.current.steerAvailable).toBe(true);
    expect(disabledBySetting.current.steerAvailable).toBe(false);
    expect(disabledByTurn.current.steerAvailable).toBe(false);
    expect(disabledByCapability.current.steerAvailable).toBe(false);
  });

  it("mirrors runtime review and mcp capabilities into commandCapabilities", () => {
    const { result: enabled } = renderHook(() =>
      useMainAppComposerWorkspaceState(buildArgs()),
    );
    const { result: disabled } = renderHook(() =>
      useMainAppComposerWorkspaceState({
        ...buildArgs(),
        runtimeCapabilities: {
          threadControls: {
            steer: true,
            fork: true,
            compact: true,
            review: false,
            mcp: false,
          },
        },
      }),
    );

    expect(enabled.current.commandCapabilities.review).toBe(true);
    expect(enabled.current.commandCapabilities.mcp).toBe(true);
    expect(disabled.current.commandCapabilities.review).toBe(false);
    expect(disabled.current.commandCapabilities.mcp).toBe(false);
  });
});
