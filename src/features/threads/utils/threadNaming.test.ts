import { describe, expect, it } from "vitest";
import { getPreferredThreadName } from "./threadNaming";

describe("getPreferredThreadName", () => {
  it("prefers the explicit thread name over preview text", () => {
    expect(
      getPreferredThreadName({
        id: "thread-1",
        name: "Saved Name",
        preview: "Preview text",
      }),
    ).toBe("Saved Name");
  });

  it("falls back to preview when explicit name is a placeholder id", () => {
    expect(
      getPreferredThreadName({
        id: "019c9e0e-7f97-78f2-a719-d28af9fb76b6",
        name: "019c9e0e-7f97-78f2-a719-d28af9fb76b6",
        preview: "Preview text",
      }),
    ).toBe("Preview text");
  });
});
