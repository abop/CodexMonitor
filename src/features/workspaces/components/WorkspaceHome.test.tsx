/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { WorkspaceHome } from "./WorkspaceHome";

const useComposerAutocompleteStateMock = vi.fn();
const fileEditorCardMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: () => {
    throw new Error("convertFileSrc is unavailable in web runtime");
  },
}));

vi.mock("../../composer/components/ComposerInput", () => ({
  ComposerInput: () => <div data-testid="composer-input" />,
}));

vi.mock("../../composer/hooks/useComposerImages", () => ({
  useComposerImages: () => ({
    activeImages: [],
    attachImages: vi.fn(),
    pickImages: vi.fn(),
    removeImage: vi.fn(),
    clearActiveImages: vi.fn(),
  }),
}));

vi.mock("../../composer/hooks/useComposerAutocompleteState", () => ({
  useComposerAutocompleteState: (args: unknown) => useComposerAutocompleteStateMock(args),
}));

vi.mock("../../composer/hooks/usePromptHistory", () => ({
  usePromptHistory: () => ({
    handleHistoryKeyDown: vi.fn(),
    handleHistoryTextChange: vi.fn(),
    recordHistory: vi.fn(),
    resetHistoryNavigation: vi.fn(),
  }),
}));

vi.mock("../../shared/components/FileEditorCard", () => ({
  FileEditorCard: (props: unknown) => {
    fileEditorCardMock(props);
    return <div data-testid="file-editor-card" />;
  },
}));

vi.mock("./WorkspaceHomeRunControls", () => ({
  WorkspaceHomeRunControls: () => <div data-testid="run-controls" />,
}));

vi.mock("./WorkspaceHomeHistory", () => ({
  WorkspaceHomeHistory: () => <div data-testid="workspace-history" />,
}));

vi.mock("./WorkspaceHomeGitInitBanner", () => ({
  WorkspaceHomeGitInitBanner: () => <div data-testid="git-banner" />,
}));

vi.mock("../hooks/useWorkspaceHomeSuggestionsStyle", () => ({
  useWorkspaceHomeSuggestionsStyle: () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  useComposerAutocompleteStateMock.mockReset();
  fileEditorCardMock.mockReset();
});

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "Project",
  path: "/tmp/project",
  connected: true,
  kind: "main",
  settings: {
    sidebarCollapsed: false,
  },
};

function renderWorkspaceHome(
  overrides?: Record<string, unknown>,
) {
  useComposerAutocompleteStateMock.mockReturnValue({
    isAutocompleteOpen: false,
    autocompleteMatches: [],
    autocompleteAnchorIndex: null,
    highlightIndex: null,
    setHighlightIndex: vi.fn(),
    applyAutocomplete: vi.fn(),
    handleInputKeyDown: vi.fn(),
    handleTextChange: vi.fn(),
    handleSelectionChange: vi.fn(),
    fileTriggerActive: false,
  });

  return render(
    <WorkspaceHome
      workspace={workspace}
      showGitInitBanner={false}
      initGitRepoLoading={false}
      onInitGitRepo={vi.fn()}
      runs={[]}
      recentThreadInstances={[]}
      recentThreadsUpdatedAt={null}
      prompt=""
      onPromptChange={vi.fn()}
      onStartRun={vi.fn().mockResolvedValue(false)}
      runMode="local"
      onRunModeChange={vi.fn()}
      models={[]}
      selectedModelId={null}
      onSelectModel={vi.fn()}
      modelSelections={{}}
      onToggleModel={vi.fn()}
      onModelCountChange={vi.fn()}
      collaborationModes={[]}
      selectedCollaborationModeId={null}
      onSelectCollaborationMode={vi.fn()}
      reasoningOptions={[]}
      selectedEffort={null}
      onSelectEffort={vi.fn()}
      reasoningSupported={false}
      error={null}
      isSubmitting={false}
      activeWorkspaceId={null}
      activeThreadId={null}
      threadStatusById={{}}
      onSelectInstance={vi.fn()}
      skills={[]}
      appsEnabled={false}
      commandCapabilities={{
        fork: false,
        compact: false,
        review: false,
        mcp: false,
      }}
      apps={[]}
      prompts={[]}
      files={[]}
      dictationEnabled={false}
      dictationState="idle"
      dictationLevel={0}
      onToggleDictation={vi.fn()}
      onOpenDictationSettings={vi.fn()}
      dictationError={null}
      onDismissDictationError={vi.fn()}
      dictationHint={null}
      onDismissDictationHint={vi.fn()}
      dictationTranscript={null}
      onDictationTranscriptHandled={vi.fn()}
      agentMdContent=""
      agentMdExists={false}
      agentMdTruncated={false}
      agentMdAvailable={false}
      agentMdWritable={false}
      agentMdLoading={false}
      agentMdSaving={false}
      agentMdError={null}
      agentMdDirty={false}
      onAgentMdChange={vi.fn()}
      onAgentMdRefresh={vi.fn()}
      onAgentMdSave={vi.fn()}
      {...(overrides as Partial<Parameters<typeof WorkspaceHome>[0]>)}
    />,
  );
}

describe("WorkspaceHome", () => {
  it("renders in web runtime without desktop file icon conversion", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    renderWorkspaceHome();

    expect(screen.getByText("Project")).toBeTruthy();
    expect(screen.getByText("/tmp/project")).toBeTruthy();
    expect(screen.getByTestId("file-editor-card")).toBeTruthy();
  });

  it("passes command capabilities through to composer autocomplete", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    renderWorkspaceHome();

    expect(useComposerAutocompleteStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commandCapabilities: {
          fork: false,
          compact: false,
          review: false,
          mcp: false,
        },
      }),
    );
  });

  it("renders supported web AGENTS.md as read-only instead of unavailable", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    renderWorkspaceHome({
      agentMdContent: "# Agent",
      agentMdExists: true,
      agentMdAvailable: true,
    });

    expect(fileEditorCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: null,
        refreshDisabled: false,
        saveDisabled: true,
        readOnly: true,
      }),
    );
  });

  it("renders supported web AGENTS.md as editable when write support is available", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    renderWorkspaceHome({
      agentMdContent: "# Agent",
      agentMdExists: true,
      agentMdAvailable: true,
      agentMdWritable: true,
      agentMdDirty: true,
    });

    expect(fileEditorCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: null,
        refreshDisabled: false,
        saveDisabled: false,
        readOnly: false,
      }),
    );
  });
});
