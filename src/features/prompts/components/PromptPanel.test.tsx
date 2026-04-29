/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PromptPanel } from "./PromptPanel";

const isWebRuntimeMock = vi.hoisted(() => vi.fn(() => true));
const menuNew = vi.hoisted(() => vi.fn(async ({ items }) => ({ popup: vi.fn(), items })));
const menuItemNew = vi.hoisted(() => vi.fn(async (options) => options));
const predefinedMenuItemNew = vi.hoisted(() => vi.fn(async (options) => options));

vi.mock("@services/runtime", async () => {
  const actual = await vi.importActual<typeof import("@services/runtime")>(
    "@services/runtime",
  );
  return {
    ...actual,
    isWebRuntime: isWebRuntimeMock,
  };
});

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: menuNew },
  MenuItem: { new: menuItemNew },
  PredefinedMenuItem: { new: predefinedMenuItemNew },
}));

describe("PromptPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isWebRuntimeMock.mockReturnValue(true);
  });

  it("opens a web action menu for prompt rows", async () => {
    render(
      <PromptPanel
        prompts={[
          {
            name: "review",
            path: "/tmp/prompts/review.md",
            description: "Review changes",
            content: "review this",
            scope: "workspace",
          },
        ]}
        workspacePath="/tmp/repo"
        filePanelMode="prompts"
        onFilePanelModeChange={vi.fn()}
        onSendPrompt={vi.fn()}
        onSendPromptToNewAgent={vi.fn()}
        onCreatePrompt={vi.fn()}
        onUpdatePrompt={vi.fn()}
        onDeletePrompt={vi.fn()}
        onMovePrompt={vi.fn()}
        onRevealWorkspacePrompts={vi.fn()}
        onRevealGeneralPrompts={vi.fn()}
        canRevealGeneralPrompts
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Prompt actions" }));

    expect(menuNew).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));

    expect(screen.getByDisplayValue("review")).toBeTruthy();
  });
});
