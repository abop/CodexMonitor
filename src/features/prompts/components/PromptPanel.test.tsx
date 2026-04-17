// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomPromptOption } from "../../../types";
import { PromptPanel } from "./PromptPanel";

const workspacePrompt: CustomPromptOption = {
  name: "fix-tests",
  path: ".codex/prompts/fix-tests.md",
  description: "Tighten coverage",
  content: "Run tests",
  scope: "workspace",
};

function renderPromptPanel(prompts: CustomPromptOption[] = [workspacePrompt]) {
  render(
    <PromptPanel
      prompts={prompts}
      workspacePath="/tmp/workspace"
      filePanelMode="prompts"
      onFilePanelModeChange={() => {}}
      onSendPrompt={() => {}}
      onSendPromptToNewAgent={() => {}}
      onCreatePrompt={() => {}}
      onUpdatePrompt={() => {}}
      onDeletePrompt={() => {}}
      onMovePrompt={() => {}}
      onRevealWorkspacePrompts={() => {}}
      onRevealGeneralPrompts={() => {}}
      canRevealGeneralPrompts
    />,
  );
}

describe("PromptPanel", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows an in-app prompt menu in web runtime", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    renderPromptPanel();

    fireEvent.click(screen.getByRole("button", { name: "Prompt actions" }));

    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move to general" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("disables reveal-folder actions in web runtime", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    renderPromptPanel([]);

    expect(screen.queryByRole("button", { name: "workspace prompts folder" })).toBeNull();
    expect(screen.queryByRole("button", { name: "CODEX_HOME/prompts" })).toBeNull();
    expect(screen.getByText("workspace prompts folder")).toBeTruthy();
    expect(screen.getAllByText("CODEX_HOME/prompts").length).toBeGreaterThan(0);
  });
});
