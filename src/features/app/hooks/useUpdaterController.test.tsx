/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdaterController } from "./useUpdaterController";

const useUpdaterMock = vi.hoisted(() => vi.fn());
const useAgentSoundNotificationsMock = vi.hoisted(() => vi.fn());
const useAgentSystemNotificationsMock = vi.hoisted(() => vi.fn());
const useWindowFocusStateMock = vi.hoisted(() => vi.fn());
const useTauriEventMock = vi.hoisted(() => vi.fn());

vi.mock("../../update/hooks/useUpdater", () => ({
  useUpdater: useUpdaterMock,
}));

vi.mock("../../notifications/hooks/useAgentSoundNotifications", () => ({
  useAgentSoundNotifications: useAgentSoundNotificationsMock,
}));

vi.mock("../../notifications/hooks/useAgentSystemNotifications", () => ({
  useAgentSystemNotifications: useAgentSystemNotificationsMock,
}));

vi.mock("../../layout/hooks/useWindowFocusState", () => ({
  useWindowFocusState: useWindowFocusStateMock,
}));

vi.mock("./useTauriEvent", () => ({
  useTauriEvent: useTauriEventMock,
}));

vi.mock("../../../utils/notificationSounds", () => ({
  playNotificationSound: vi.fn(),
}));

vi.mock("../../../services/events", () => ({
  subscribeUpdaterCheck: vi.fn(),
}));

vi.mock("../../../services/tauri", () => ({
  sendNotification: vi.fn(),
}));

describe("useUpdaterController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowFocusStateMock.mockReturnValue(false);
    useUpdaterMock.mockReturnValue({
      state: { stage: "idle" },
      startUpdate: vi.fn(),
      checkForUpdates: vi.fn(),
      dismiss: vi.fn(),
      postUpdateNotice: null,
      dismissPostUpdateNotice: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("disables updater work in the web build", () => {
    vi.stubEnv("VITE_CODEXMONITOR_RUNTIME", "web");

    renderHook(() =>
      useUpdaterController({
        notificationSoundsEnabled: true,
        systemNotificationsEnabled: true,
        subagentSystemNotificationsEnabled: true,
        onDebug: vi.fn(),
        successSoundUrl: "/success.mp3",
        errorSoundUrl: "/error.mp3",
      }),
    );

    expect(useUpdaterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    );
    expect(useTauriEventMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ enabled: false }),
    );
  });
});
