import { isWebRuntime } from "@services/runtime";
import { createWebLocalPathUnsupportedError } from "./runtimeErrors";

export async function openExternalUrl(url: string): Promise<void> {
  if (isWebRuntime()) {
    const opener =
      typeof globalThis.open === "function"
        ? globalThis.open
        : typeof window !== "undefined"
          ? window.open
          : null;
    opener?.(url, "_blank", "noopener,noreferrer");
    return;
  }

  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export async function revealPathInFileManager(path: string): Promise<void> {
  if (isWebRuntime()) {
    throw createWebLocalPathUnsupportedError();
  }

  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}
