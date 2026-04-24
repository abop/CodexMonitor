import type { AccessMode } from "@/types";

export const ACCESS_MODE_ORDER: AccessMode[] = [
  "default",
  "auto-review",
  "full-access",
];

export function normalizeAccessMode(value: unknown): AccessMode | null {
  switch (value) {
    case "default":
    case "auto-review":
    case "full-access":
      return value;
    case "current":
    case "read-only":
      return "default";
    default:
      return null;
  }
}

export function getAccessModeLabel(value: unknown): string {
  switch (normalizeAccessMode(value)) {
    case "auto-review":
      return "Auto-review";
    case "full-access":
      return "Full access";
    default:
      return "Default";
  }
}
