// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: undefined,
}));

vi.mock("../../composer/components/ComposerInput", () => ({
  ComposerInput: () => <div>Composer Input</div>,
}));

vi.mock("../../shared/components/FileEditorCard", () => ({
  FileEditorCard: () => <div>File Editor Card</div>,
}));

vi.mock("./WorkspaceHomeRunControls", () => ({
  WorkspaceHomeRunControls: () => <div>Run Controls</div>,
}));

vi.mock("./WorkspaceHomeHistory", () => ({
  WorkspaceHomeHistory: () => <div>Workspace History</div>,
}));

vi.mock("../hooks/useWorkspaceHomeSuggestionsStyle", () => ({
  useWorkspaceHomeSuggestionsStyle: () => undefined,
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
  useComposerAutocompleteState: () => ({
    isAutocompleteOpen: false,
    autocompleteMatches: [],
    autocompleteAnchorIndex: null,
    highlightIndex: 0,
    setHighlightIndex: vi.fn(),
    applyAutocomplete: vi.fn(),
    handleInputKeyDown: vi.fn(),
    handleTextChange: vi.fn(),
    handleSelectionChange: vi.fn(),
    fileTriggerActive: false,
  }),
}));

vi.mock("../../composer/hooks/usePromptHistory", () => ({
  usePromptHistory: () => ({
    handleHistoryKeyDown: vi.fn(),
    handleHistoryTextChange: vi.fn(),
    recordHistory: vi.fn(),
    resetHistoryNavigation: vi.fn(),
  }),
}));

import { WorkspaceHome } from "./WorkspaceHome";

describe("WorkspaceHome", () => {
  it("does not crash when file icon conversion is unavailable", () => {
    render(
      <WorkspaceHome
        workspace={{
          id: "workspace-1",
          name: "daemon-web",
          path: "/tmp/daemon-web",
          connected: true,
          kind: "main",
          settings: {
            sidebarCollapsed: false,
          },
        }}
        showGitInitBanner={false}
        initGitRepoLoading={false}
        onInitGitRepo={vi.fn()}
        runs={[]}
        recentThreadInstances={[]}
        recentThreadsUpdatedAt={null}
        prompt=""
        onPromptChange={vi.fn()}
        onStartRun={vi.fn(async () => true)}
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
        apps={[]}
        prompts={[]}
        files={[]}
        dictationEnabled={false}
        dictationState="idle"
        dictationLevel={0}
        onToggleDictation={vi.fn()}
        onCancelDictation={vi.fn()}
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
        agentMdLoading={false}
        agentMdSaving={false}
        agentMdError={null}
        agentMdDirty={false}
        onAgentMdChange={vi.fn()}
        onAgentMdRefresh={vi.fn()}
        onAgentMdSave={vi.fn()}
      />,
    );

    expect(screen.getByText("daemon-web")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
