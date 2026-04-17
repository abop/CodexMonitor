// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceFromUrlPrompt } from "./WorkspaceFromUrlPrompt";

const isWebRuntimeMock = vi.fn();

vi.mock("@services/runtime", () => ({
  isWebRuntime: () => isWebRuntimeMock(),
}));

describe("WorkspaceFromUrlPrompt", () => {
  beforeEach(() => {
    isWebRuntimeMock.mockReset();
  });

  it("uses editable server-path entry in web runtime", () => {
    isWebRuntimeMock.mockReturnValue(true);
    const onDestinationPathChange = vi.fn();

    render(
      <WorkspaceFromUrlPrompt
        url="https://example.com/org/repo.git"
        destinationPath="/srv/repos"
        targetFolderName=""
        error={null}
        isBusy={false}
        canSubmit
        onUrlChange={() => {}}
        onDestinationPathChange={onDestinationPathChange}
        onTargetFolderNameChange={() => {}}
        onChooseDestinationPath={() => {}}
        onClearDestinationPath={() => {}}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    const destinationInput = screen.getByLabelText("Destination parent folder");
    expect((destinationInput as HTMLTextAreaElement).readOnly).toBe(false);
    expect(screen.queryByRole("button", { name: "Choose…" })).toBeNull();

    fireEvent.change(destinationInput, { target: { value: "/srv/repos/team-a" } });

    expect(onDestinationPathChange).toHaveBeenCalledWith("/srv/repos/team-a");
  });
});
