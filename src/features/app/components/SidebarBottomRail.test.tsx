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
    defaultBackendId: null,
    activeBackend: null,
  })),
  subscribeRuntimeBackendBaseUrl: vi.fn(() => () => {}),
  setActiveRuntimeWebBackend: vi.fn(),
  setDefaultRuntimeWebBackend: vi.fn(),
  buildRuntimeWebBackendWindowUrl: vi.fn(),
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
      defaultBackendId: null,
      activeBackend: null,
    } as never);
    vi.mocked((runtime as any).listRuntimeWebBackends).mockReturnValue([]);
    vi.mocked(runtime.subscribeRuntimeBackendBaseUrl).mockReturnValue(() => {});
    vi.mocked(runtime.buildRuntimeWebBackendWindowUrl).mockReturnValue(
      "https://app.example.test/?backend=backend-1",
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a web backend entry below settings in web runtime", () => {
    vi.mocked(runtime.isWebRuntime).mockReturnValue(true);
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: "https://daemon.example.com",
      backendToken: "secret-token",
      defaultBackendId: "backend-1",
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
      defaultBackendId: "backend-1",
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

    expect(
      screen.getByRole("dialog", { name: "Manage Web Backends" }),
    ).toBeTruthy();
    expect(screen.getByText("Manage Web Backends")).toBeTruthy();
    expect(screen.getAllByText("Remote Office").length).toBeGreaterThan(0);
  });

  it("shows separate current and default markers for web backends", () => {
    vi.mocked(runtime.isWebRuntime).mockReturnValue(true);
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: "https://window.example.com",
      backendToken: null,
      defaultBackendId: "backend-default",
      activeBackend: {
        id: "backend-window",
        name: "Window Backend",
        baseUrl: "https://window.example.com",
        token: null,
      },
    } as never);
    vi.mocked((runtime as any).listRuntimeWebBackends).mockReturnValue([
      {
        id: "backend-default",
        name: "Default Backend",
        baseUrl: "https://default.example.com",
        token: null,
      },
      {
        id: "backend-window",
        name: "Window Backend",
        baseUrl: "https://window.example.com",
        token: null,
      },
    ]);

    render(<SidebarBottomRail {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Web Backend" }));

    expect(screen.getByText("Default")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
  });

  it("does not duplicate the default marker when the current backend is also default", () => {
    vi.mocked(runtime.isWebRuntime).mockReturnValue(true);
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: "https://daemon.example.com",
      backendToken: null,
      defaultBackendId: "backend-1",
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

    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.queryByText("Default")).toBeNull();
  });

  it("uses the selected backend for the current window", () => {
    vi.mocked(runtime.isWebRuntime).mockReturnValue(true);
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: "https://daemon.example.com",
      backendToken: null,
      defaultBackendId: "backend-1",
      activeBackend: {
        id: "backend-1",
        name: "Default Backend",
        baseUrl: "https://daemon.example.com",
        token: null,
      },
    } as never);
    vi.mocked((runtime as any).listRuntimeWebBackends).mockReturnValue([
      {
        id: "backend-1",
        name: "Default Backend",
        baseUrl: "https://daemon.example.com",
        token: null,
      },
      {
        id: "backend-2",
        name: "Remote Office",
        baseUrl: "https://remote.example.com",
        token: null,
      },
    ]);

    render(<SidebarBottomRail {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Web Backend" }));
    fireEvent.click(screen.getByRole("button", { name: "Use Remote Office" }));

    expect(runtime.setActiveRuntimeWebBackend).toHaveBeenCalledWith("backend-2");
  });

  it("sets the shared default backend without changing the current window", () => {
    vi.mocked(runtime.isWebRuntime).mockReturnValue(true);
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: "https://window.example.com",
      backendToken: null,
      defaultBackendId: "backend-1",
      activeBackend: {
        id: "backend-2",
        name: "Remote Office",
        baseUrl: "https://remote.example.com",
        token: null,
      },
    } as never);
    vi.mocked((runtime as any).listRuntimeWebBackends).mockReturnValue([
      {
        id: "backend-1",
        name: "Default Backend",
        baseUrl: "https://default.example.com",
        token: null,
      },
      {
        id: "backend-2",
        name: "Remote Office",
        baseUrl: "https://remote.example.com",
        token: null,
      },
    ]);

    render(<SidebarBottomRail {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Web Backend" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Set Remote Office as default" }),
    );

    expect(runtime.setDefaultRuntimeWebBackend).toHaveBeenCalledWith("backend-2");
    expect(runtime.setActiveRuntimeWebBackend).not.toHaveBeenCalled();
  });

  it("opens a backend in a new window with noopener and noreferrer", () => {
    vi.mocked(runtime.isWebRuntime).mockReturnValue(true);
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: "https://daemon.example.com",
      backendToken: null,
      defaultBackendId: "backend-1",
      activeBackend: {
        id: "backend-1",
        name: "Default Backend",
        baseUrl: "https://daemon.example.com",
        token: null,
      },
    } as never);
    vi.mocked((runtime as any).listRuntimeWebBackends).mockReturnValue([
      {
        id: "backend-1",
        name: "Default Backend",
        baseUrl: "https://daemon.example.com",
        token: null,
      },
    ]);
    vi.mocked(runtime.buildRuntimeWebBackendWindowUrl).mockReturnValue(
      "https://app.example.test/?backend=backend-1",
    );
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);

    render(<SidebarBottomRail {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Web Backend" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Open Default Backend in new window" }),
    );

    expect(runtime.buildRuntimeWebBackendWindowUrl).toHaveBeenCalledWith("backend-1");
    expect(openSpy).toHaveBeenCalledWith(
      "https://app.example.test/?backend=backend-1",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("shows an error when a backend window is blocked", () => {
    vi.mocked(runtime.isWebRuntime).mockReturnValue(true);
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: "https://daemon.example.com",
      backendToken: null,
      defaultBackendId: "backend-1",
      activeBackend: {
        id: "backend-1",
        name: "Default Backend",
        baseUrl: "https://daemon.example.com",
        token: null,
      },
    } as never);
    vi.mocked((runtime as any).listRuntimeWebBackends).mockReturnValue([
      {
        id: "backend-1",
        name: "Default Backend",
        baseUrl: "https://daemon.example.com",
        token: null,
      },
    ]);
    vi.spyOn(window, "open").mockReturnValue(null);

    render(<SidebarBottomRail {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Web Backend" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Open Default Backend in new window" }),
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "Unable to open new window.",
    );
  });

  it("passes blank backend names through when saving", () => {
    vi.mocked(runtime.isWebRuntime).mockReturnValue(true);
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: null,
      backendToken: null,
      defaultBackendId: null,
      activeBackend: null,
    } as never);
    vi.mocked((runtime as any).listRuntimeWebBackends).mockReturnValue([]);

    render(<SidebarBottomRail {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Web Backend" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Web backend URL" }), {
      target: { value: "https://blank-name.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add backend" }));

    expect(runtime.upsertRuntimeWebBackend).toHaveBeenCalledWith(
      {
        id: undefined,
        name: "",
        baseUrl: "https://blank-name.example.com",
        token: "",
      },
      { activate: true },
    );
  });
});
