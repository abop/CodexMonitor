import { useCallback, useRef } from "react";
import { useUpdater } from "../../update/hooks/useUpdater";
import { useAgentSoundNotifications } from "../../notifications/hooks/useAgentSoundNotifications";
import { useAgentSystemNotifications } from "../../notifications/hooks/useAgentSystemNotifications";
import { useWindowFocusState } from "../../layout/hooks/useWindowFocusState";
import { useTauriEvent } from "./useTauriEvent";
import { playNotificationSound } from "../../../utils/notificationSounds";
import { subscribeUpdaterCheck } from "../../../services/events";
import { sendNotification } from "../../../services/tauri";
import { isWebRuntime } from "@services/runtime";
import type { DebugEntry } from "../../../types";

type Params = {
  enabled?: boolean;
  autoCheckOnMount?: boolean;
  notificationSoundsEnabled: boolean;
  systemNotificationsEnabled: boolean;
  subagentSystemNotificationsEnabled: boolean;
  isSubagentThread?: (workspaceId: string, threadId: string) => boolean;
  getWorkspaceName?: (workspaceId: string) => string | undefined;
  onThreadNotificationSent?: (workspaceId: string, threadId: string) => void;
  onDebug: (entry: DebugEntry) => void;
  successSoundUrl: string;
  errorSoundUrl: string;
};

export function useUpdaterController({
  enabled = true,
  autoCheckOnMount = true,
  notificationSoundsEnabled,
  systemNotificationsEnabled,
  subagentSystemNotificationsEnabled,
  isSubagentThread,
  getWorkspaceName,
  onThreadNotificationSent,
  onDebug,
  successSoundUrl,
  errorSoundUrl,
}: Params) {
  const webRuntime = isWebRuntime();
  const updaterEnabled = enabled && !webRuntime;
  const {
    state: updaterState,
    startUpdate,
    checkForUpdates,
    dismiss,
    postUpdateNotice,
    dismissPostUpdateNotice,
  } = useUpdater({
    enabled: updaterEnabled,
    autoCheckOnMount,
    onDebug,
  });
  const isWindowFocused = useWindowFocusState();
  const nextTestSoundIsError = useRef(false);

  const subscribeUpdaterCheckEvent = useCallback(
    (handler: () => void) =>
      subscribeUpdaterCheck(handler, {
        onError: (error) => {
          onDebug({
            id: `${Date.now()}-client-updater-menu-error`,
            timestamp: Date.now(),
            source: "error",
            label: "updater/menu-error",
            payload: error instanceof Error ? error.message : String(error),
          });
        },
      }),
    [onDebug],
  );

  useTauriEvent(
    subscribeUpdaterCheckEvent,
    () => {
      void checkForUpdates({ announceNoUpdate: true });
    },
    { enabled: updaterEnabled },
  );

  useAgentSoundNotifications({
    enabled: notificationSoundsEnabled && !webRuntime,
    isWindowFocused,
    onDebug,
  });

  useAgentSystemNotifications({
    enabled: systemNotificationsEnabled && !webRuntime,
    subagentNotificationsEnabled: subagentSystemNotificationsEnabled,
    isSubagentThread,
    isWindowFocused,
    getWorkspaceName,
    onThreadNotificationSent,
    onDebug,
  });

  const handleTestNotificationSound = useCallback(() => {
    if (webRuntime) {
      return;
    }
    const useError = nextTestSoundIsError.current;
    nextTestSoundIsError.current = !useError;
    const type = useError ? "error" : "success";
    const url = useError ? errorSoundUrl : successSoundUrl;
    playNotificationSound(url, type, onDebug);
  }, [errorSoundUrl, onDebug, successSoundUrl, webRuntime]);

  const handleTestSystemNotification = useCallback(() => {
    if (webRuntime || !systemNotificationsEnabled) {
      return;
    }
    void sendNotification(
      "Test Notification",
      "This is a test notification from CodexMonitor.",
    ).catch((error) => {
      onDebug({
        id: `${Date.now()}-client-notification-test-error`,
        timestamp: Date.now(),
        source: "error",
        label: "notification/test-error",
        payload: error instanceof Error ? error.message : String(error),
      });
    });
  }, [onDebug, systemNotificationsEnabled, webRuntime]);

  return {
    updaterState,
    startUpdate,
    checkForUpdates,
    dismissUpdate: dismiss,
    postUpdateNotice,
    dismissPostUpdateNotice,
    handleTestNotificationSound,
    handleTestSystemNotification,
  };
}
