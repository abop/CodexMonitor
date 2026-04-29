import { describe, expect, it } from "vitest";
import { DIFF_VIEWER_SCROLL_CSS } from "./diffViewerTheme";

describe("DIFF_VIEWER_SCROLL_CSS", () => {
  it("does not override diff separator wrapper positioning", () => {
    expect(DIFF_VIEWER_SCROLL_CSS).not.toMatch(/data-separator-wrapper/);
  });
});
