// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as runtime from "@services/runtime";

vi.mock("@/features/layout/hooks/useWindowLabel", () => ({
  useWindowLabel: vi.fn(() => "main"),
}));

vi.mock("@app/components/MainApp", () => ({
  default: () => <div>Main App</div>,
}));

vi.mock("@services/runtime", () => ({
  readRuntimeConfig: vi.fn(() => ({
    runtime: "desktop",
    backendBaseUrl: null,
    backendToken: null,
    defaultBackendId: null,
    activeBackend: null,
  })),
  setRuntimeBackendBaseUrl: vi.fn(),
  subscribeRuntimeBackendBaseUrl: vi.fn(() => () => {}),
  upsertRuntimeWebBackend: vi.fn(),
}));

describe("App runtime boot", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "desktop",
      backendBaseUrl: null,
      backendToken: null,
      defaultBackendId: null,
      activeBackend: null,
    });
    vi.mocked(runtime.subscribeRuntimeBackendBaseUrl).mockReturnValue(() => {});
  });

  it("renders the main app for desktop runtime", () => {
    render(<App />);

    expect(screen.getByText("Main App")).not.toBeNull();
  });

  it("shows backend setup when web runtime has no backend url", () => {
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: null,
      backendToken: null,
      defaultBackendId: null,
      activeBackend: null,
    });

    render(<App />);

    expect(screen.getByText("Connect Web Backend")).not.toBeNull();
    expect(screen.queryByText("Main App")).toBeNull();
  });

  it("shows backend name and optional token inputs in the web setup form", () => {
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: null,
      backendToken: null,
      defaultBackendId: null,
      activeBackend: null,
    });

    render(<App />);

    expect(screen.getByLabelText("Backend name")).not.toBeNull();
    expect(screen.getByLabelText("Backend URL")).not.toBeNull();
    expect(screen.getByLabelText("Access token (optional)")).not.toBeNull();
  });

  it("saves a named backend with an optional token from the web setup form", () => {
    vi.mocked(runtime.readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: null,
      backendToken: null,
      defaultBackendId: null,
      activeBackend: null,
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText("Backend name"), {
      target: { value: "Remote Office" },
    });
    fireEvent.change(screen.getByLabelText("Backend URL"), {
      target: { value: " https://daemon.example.com/ " },
    });
    fireEvent.change(screen.getByLabelText("Access token (optional)"), {
      target: { value: " secret-token " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect((runtime as any).upsertRuntimeWebBackend).toHaveBeenCalledWith(
      {
        name: "Remote Office",
        baseUrl: "https://daemon.example.com/",
        token: "secret-token",
      },
      { activate: true },
    );
  });
});
