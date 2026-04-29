import { describe, expect, it } from "vitest";
import { buildFileDiffMetadata } from "./diffMetadata";

describe("buildFileDiffMetadata", () => {
  it("aligns hunk indexes with full file contents when old and new lines are available", () => {
    const oldLines = Array.from(
      { length: 120 },
      (_, index) => `line ${index + 1}\n`,
    );
    const newLines = [...oldLines];
    newLines[112] = "changed 113\n";
    const diff = [
      "diff --git a/src/main.ts b/src/main.ts",
      "index 1111111..2222222 100644",
      "--- a/src/main.ts",
      "+++ b/src/main.ts",
      "@@ -110,7 +110,7 @@",
      " line 110",
      " line 111",
      " line 112",
      "-line 113",
      "+changed 113",
      " line 114",
      " line 115",
      " line 116",
      "",
    ].join("\n");

    const fileDiff = buildFileDiffMetadata({
      diff,
      displayPath: "src/main.ts",
      oldLines,
      newLines,
    });

    expect(fileDiff?.isPartial).toBe(false);
    expect(fileDiff?.additionLines).toHaveLength(120);
    expect(fileDiff?.deletionLines).toHaveLength(120);
    expect(fileDiff?.hunks[0]?.additionLineIndex).toBe(109);
    expect(fileDiff?.hunks[0]?.deletionLineIndex).toBe(109);
  });

  it("builds full metadata for added files by supplying an empty old side", () => {
    const diff = [
      "diff --git a/src/new.ts b/src/new.ts",
      "new file mode 100644",
      "index 0000000..2222222",
      "--- /dev/null",
      "+++ b/src/new.ts",
      "@@ -0,0 +1,2 @@",
      "+new 1",
      "+new 2",
      "",
    ].join("\n");

    const fileDiff = buildFileDiffMetadata({
      diff,
      displayPath: "src/new.ts",
      newLines: ["new 1\n", "new 2\n"],
    });

    expect(fileDiff?.isPartial).toBe(false);
    expect(fileDiff?.type).toBe("new");
    expect(fileDiff?.deletionLines).toHaveLength(0);
    expect(fileDiff?.additionLines).toHaveLength(2);
    expect(fileDiff?.hunks[0]?.additionLineIndex).toBe(0);
  });

  it("builds full metadata for deleted files by supplying an empty new side", () => {
    const diff = [
      "diff --git a/src/old.ts b/src/old.ts",
      "deleted file mode 100644",
      "index 1111111..0000000",
      "--- a/src/old.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-old 1",
      "-old 2",
      "",
    ].join("\n");

    const fileDiff = buildFileDiffMetadata({
      diff,
      displayPath: "src/old.ts",
      oldLines: ["old 1\n", "old 2\n"],
    });

    expect(fileDiff?.isPartial).toBe(false);
    expect(fileDiff?.type).toBe("deleted");
    expect(fileDiff?.deletionLines).toHaveLength(2);
    expect(fileDiff?.additionLines).toHaveLength(0);
    expect(fileDiff?.hunks[0]?.deletionLineIndex).toBe(0);
  });
});
