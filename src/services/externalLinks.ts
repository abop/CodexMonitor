import { openUrl } from "@tauri-apps/plugin-opener";
import { isWebRuntime } from "./runtime";

const WEB_EXTERNAL_TARGET = "_blank";
const WEB_EXTERNAL_FEATURES = "noopener,noreferrer";
const ALLOWED_EXTERNAL_PROTOCOLS = new Set([
  "http:",
  "https:",
  "mailto:",
  "tel:",
]);

function normalizeExternalUrl(url: string | URL) {
  const href = url instanceof URL ? url.toString() : String(url);
  const parsed = new URL(href, "https://codexmonitor.invalid");
  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Unsupported external URL protocol: ${parsed.protocol}`);
  }
  return href;
}

export async function openExternalUrl(url: string | URL) {
  const href = normalizeExternalUrl(url);
  if (isWebRuntime()) {
    if (typeof window === "undefined" || typeof window.open !== "function") {
      throw new Error("External URL opening is unavailable in this runtime.");
    }
    window.open(href, WEB_EXTERNAL_TARGET, WEB_EXTERNAL_FEATURES);
    return;
  }
  await openUrl(href);
}
