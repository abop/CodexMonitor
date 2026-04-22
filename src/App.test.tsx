// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  readRuntimeConfig,
  setRuntimeBackendBaseUrl,
  subscribeRuntimeBackendBaseUrl,
} from "@services/runtime";

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
  })),
  setRuntimeBackendBaseUrl: vi.fn(),
  subscribeRuntimeBackendBaseUrl: vi.fn(() => () => {}),
}));

describe("App runtime boot", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readRuntimeConfig).mockReturnValue({
      runtime: "desktop",
      backendBaseUrl: null,
    });
    vi.mocked(subscribeRuntimeBackendBaseUrl).mockReturnValue(() => {});
  });

  it("renders the main app for desktop runtime", () => {
    render(<App />);

    expect(screen.getByText("Main App")).not.toBeNull();
  });

  it("shows backend setup when web runtime has no backend url", () => {
    vi.mocked(readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: null,
    });

    render(<App />);

    expect(screen.getByText("Connect Web Backend")).not.toBeNull();
    expect(screen.queryByText("Main App")).toBeNull();
  });

  it("submits a trimmed backend url from the web setup form", () => {
    vi.mocked(readRuntimeConfig).mockReturnValue({
      runtime: "web",
      backendBaseUrl: null,
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText("Backend URL"), {
      target: { value: " https://daemon.example.com/ " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(setRuntimeBackendBaseUrl).toHaveBeenCalledWith("https://daemon.example.com/");
  });
});
