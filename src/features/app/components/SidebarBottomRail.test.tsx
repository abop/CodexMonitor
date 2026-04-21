/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarBottomRail } from "./SidebarBottomRail";

vi.mock("@/features/webBridge", () => ({
  WebBridgeSwitcher: ({ placement }: { placement?: string }) => (
    <div data-testid="web-bridge-switcher" data-placement={placement ?? "default"} />
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const buildProps = (
  overrides: Partial<ComponentProps<typeof SidebarBottomRail>> = {},
) =>
  ({
    sessionPercent: 24,
    weeklyPercent: 55,
    sessionResetLabel: "Resets in 3 hours",
    weeklyResetLabel: "Resets in 7 days",
    creditsLabel: null,
    showWeekly: true,
    onOpenSettings: vi.fn(),
    onOpenDebug: vi.fn(),
    showDebugButton: true,
    showAccountSwitcher: true,
    accountLabel: "dev@example.com",
    accountActionLabel: "Switch",
    accountDisabled: false,
    accountSwitching: false,
    accountCancelDisabled: false,
    onSwitchAccount: vi.fn(),
    onCancelSwitchAccount: vi.fn(),
    ...overrides,
  }) as ComponentProps<typeof SidebarBottomRail>;

describe("SidebarBottomRail", () => {
  it("renders the web bridge switcher below the account and utility row in web runtime", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    const { container } = render(<SidebarBottomRail {...buildProps()} />);

    const actionsRow = container.querySelector(".sidebar-bottom-actions");
    const bridgeRow = container.querySelector(".sidebar-bottom-bridge");
    const switcher = screen.getByTestId("web-bridge-switcher");

    expect(actionsRow).toBeTruthy();
    expect(bridgeRow).toBeTruthy();
    expect(switcher.getAttribute("data-placement")).toBe("sidebar");
    const position = (actionsRow as Node).compareDocumentPosition(bridgeRow as Node);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the account switcher in web runtime when the parent enables it", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    render(<SidebarBottomRail {...buildProps()} />);

    expect(screen.getByRole("button", { name: "Account" })).toBeTruthy();
  });

  it("hides the web bridge switcher outside the web runtime", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "desktop");

    render(<SidebarBottomRail {...buildProps()} />);

    expect(screen.queryByTestId("web-bridge-switcher")).toBeNull();
  });
});
