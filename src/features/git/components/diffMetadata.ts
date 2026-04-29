import {
  parsePatchFiles,
  processFile,
  type FileContents,
  type FileDiffMetadata,
} from "@pierre/diffs";
import { normalizePatchName } from "./GitDiffViewer.utils";

type BuildFileDiffMetadataOptions = {
  diff: string;
  displayPath: string;
  oldLines?: string[];
  newLines?: string[];
};

function normalizeFileDiff(fileDiff: FileDiffMetadata, displayPath: string) {
  const normalizedName = normalizePatchName(fileDiff.name || displayPath);
  const normalizedPrevName = fileDiff.prevName
    ? normalizePatchName(fileDiff.prevName)
    : undefined;

  return {
    ...fileDiff,
    name: normalizedName,
    prevName: normalizedPrevName,
  } satisfies FileDiffMetadata;
}

function buildFullFileContents(
  parsed: FileDiffMetadata,
  displayPath: string,
  oldLines?: string[],
  newLines?: string[],
): { oldFile: FileContents; newFile: FileContents } | null {
  const oldContents =
    oldLines != null ? oldLines.join("") : parsed.type === "new" ? "" : null;
  const newContents =
    newLines != null
      ? newLines.join("")
      : parsed.type === "deleted"
        ? ""
        : null;

  if (oldContents == null || newContents == null) {
    return null;
  }

  return {
    oldFile: {
      name: parsed.prevName ?? parsed.name ?? displayPath,
      contents: oldContents,
    },
    newFile: {
      name: parsed.name || displayPath,
      contents: newContents,
    },
  };
}

export function buildFileDiffMetadata({
  diff,
  displayPath,
  oldLines,
  newLines,
}: BuildFileDiffMetadataOptions): FileDiffMetadata | null {
  if (!diff.trim()) {
    return null;
  }

  const parsed = parsePatchFiles(diff)[0]?.files[0];
  if (!parsed) {
    return null;
  }

  const fullContents = buildFullFileContents(
    parsed,
    displayPath,
    oldLines,
    newLines,
  );
  if (fullContents) {
    const fullFileDiff = processFile(diff, fullContents);
    if (fullFileDiff) {
      return normalizeFileDiff(fullFileDiff, displayPath);
    }
  }

  return normalizeFileDiff(parsed, displayPath);
}
