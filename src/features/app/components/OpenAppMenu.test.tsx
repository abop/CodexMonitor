/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAppMenu } from "./OpenAppMenu";

vi.mock("../../design-system/components/popover/PopoverPrimitives", () => ({
  PopoverMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SplitActionMenu: ({
    actionButton,
    children,
  }: {
    actionButton: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      {actionButton}
      {children}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("OpenAppMenu", () => {
  it("renders in the desktop build", () => {
    render(
      <OpenAppMenu
        path="/workspace"
        openTargets={[
          {
            id: "vscode",
            label: "VS Code",
            kind: "app",
            appName: "Visual Studio Code",
            command: null,
            args: [],
          },
        ]}
        selectedOpenAppId="vscode"
        onSelectOpenAppId={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Open in VS Code" })).toBeTruthy();
  });

  it("does not render in the web build", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    render(
      <OpenAppMenu
        path="/workspace"
        openTargets={[
          {
            id: "vscode",
            label: "VS Code",
            kind: "app",
            appName: "Visual Studio Code",
            command: null,
            args: [],
          },
        ]}
        selectedOpenAppId="vscode"
        onSelectOpenAppId={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Open in VS Code" })).toBeNull();
  });
});
