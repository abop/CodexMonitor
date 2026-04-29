import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest runs this in Node, while the app tsconfig omits Node types.
import { readFileSync } from "node:fs";

const mainCss = readFileSync(new URL("./main.css", import.meta.url), "utf8");

function cssBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = mainCss.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`));
  return match?.groups?.body ?? "";
}

describe("worktree info popover styles", () => {
  it("uses theme-aware control surfaces for interactive controls", () => {
    const controls = [
      ".worktree-info-copy",
      ".worktree-info-reveal",
      ".worktree-info-input",
      ".worktree-info-confirm",
    ];

    for (const selector of controls) {
      const body = cssBlock(selector);
      expect(body).toContain("background: var(--surface-control)");
      expect(body).not.toContain("rgba(12, 16, 26");
    }
  });
});
