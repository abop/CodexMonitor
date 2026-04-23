// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarBottomRail } from "./SidebarBottomRail";
import * as runtime from "@services/runtime";

vi.mock("@services/runtime", () => ({
  isWebRuntime: vi.fn(() => false),
  listRuntimeWebBackends: vi.fn(() => []),
  readRuntimeConfig: vi.fn(() => ({
    runtime: "desktop",
    backendBaseUrl: null,
    backendToken: null,
    activeBackend: null,
  })),
  subscribeRuntimeBackendBaseUrl: vi.fn(() => () => {}),
  setActiveRuntimeWebBackend: vi.fn(),
  deleteRuntimeWebBackend: vi.fn(),
  upsertRuntimeWebBackend: vi.fn(),
}));

const baseProps = {
  sessionPercent: null,
  weeklyPercent: null,
  sessionResetLabel: null,
  weeklyResetLabel: null,
  creditsLabel: null,
  showWeekly: false,
  onOpenSettings: vi.fn(),
  onOpenDebug: vi.fn(),
  showDebugButton: false,
  showAccountSwitcher: false,
  accountLabel: "Sign in to Codex",
  accountActionLabel: "Sign in",
  accountDisabled: false,
  accountSwitching: false,
  accountCancelDisabled: true,
  onSwitchAccount: vi.fn(),
  onCancelSwitchAccount: vi.fn(),
};

describe("SidebarBottomRail web backend control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runtime.isWebRuntime).mockReturnValue(false);
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "desktop",
      backendBaseUrl: null,
      backendToken: null,
      activeBackend: null,
    } as never);
    vi.mocked((runtime as any).listRuntimeWebBackends).mockReturnValue([]);
    vi.mocked(runtime.subscribeRuntimeBackendBaseUrl).mockReturnValue(() => {});
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a web backend entry below settings in web runtime", () => {
    vi.mocked(runtime.isWebRuntime).mockReturnValue(true);
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: "https://daemon.example.com",
      backendToken: "secret-token",
      activeBackend: {
        id: "backend-1",
        name: "Remote Office",
        baseUrl: "https://daemon.example.com",
        token: "secret-token",
      },
    } as never);
    vi.mocked((runtime as any).listRuntimeWebBackends).mockReturnValue([
      {
        id: "backend-1",
        name: "Remote Office",
        baseUrl: "https://daemon.example.com",
        token: "secret-token",
      },
    ]);

    render(<SidebarBottomRail {...baseProps} />);

    expect(screen.getByRole("button", { name: "Web Backend" })).toBeTruthy();
    expect(screen.getByText("Remote Office")).toBeTruthy();
  });

  it("opens the web backend popover from the bottom rail", () => {
    vi.mocked(runtime.isWebRuntime).mockReturnValue(true);
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: "https://daemon.example.com",
      backendToken: null,
      activeBackend: {
        id: "backend-1",
        name: "Remote Office",
        baseUrl: "https://daemon.example.com",
        token: null,
      },
    } as never);
    vi.mocked((runtime as any).listRuntimeWebBackends).mockReturnValue([
      {
        id: "backend-1",
        name: "Remote Office",
        baseUrl: "https://daemon.example.com",
        token: null,
      },
    ]);

    render(<SidebarBottomRail {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Web Backend" }));

    expect(screen.getByText("Manage Web Backends")).toBeTruthy();
    expect(screen.getAllByText("Remote Office").length).toBeGreaterThan(0);
  });
});
