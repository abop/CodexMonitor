import type { ConversationItem } from "@/types";
import { describe, expect, it } from "vitest";
import { buildBackgroundTerminalLines } from "./threadMessagingHelpers";

function commandItem(
  id: string,
  overrides: Partial<Extract<ConversationItem, { kind: "tool" }>> = {},
): Extract<ConversationItem, { kind: "tool" }> {
  return {
    id,
    kind: "tool",
    toolType: "commandExecution",
    title: `Command: npm run task-${id}`,
    detail: `npm run task-${id}`,
    status: "inProgress",
    output: "",
    ...overrides,
  };
}

describe("threadMessagingHelpers", () => {
  it("caps /ps output and truncates noisy command text", () => {
    const longCommand = `Command: ${"x".repeat(120)}\nsecond line`;
    const items = Array.from({ length: 17 }, (_, index) =>
      commandItem(String(index), {
        title: index === 0 ? longCommand : `Command: npm run task-${index}`,
      }),
    );

    const lines = buildBackgroundTerminalLines(items);

    expect(lines[0]).toBe("Background terminals:");
    expect(lines).toContain(`- ${"x".repeat(74)} [...]`);
    expect(lines).toContain("- ... and 1 more running");
    expect(lines.some((line) => line.includes("task-16"))).toBe(false);
  });
});
