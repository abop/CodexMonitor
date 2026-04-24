import type { ModelOption } from "../../../types";

const DEFAULT_GPT_REASONING_EFFORT = "medium";
const GPT_REASONING_EFFORTS: ModelOption["supportedReasoningEfforts"] = [
  { reasoningEffort: "low", description: "" },
  { reasoningEffort: "medium", description: "" },
  { reasoningEffort: "high", description: "" },
  { reasoningEffort: "xhigh", description: "" },
];
const CONFIG_MODEL_DESCRIPTION = "Configured in CODEX_HOME/config.toml";

export function normalizeEffortValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractModelItems(response: unknown): unknown[] {
  if (!response || typeof response !== "object") {
    return [];
  }

  const record = response as Record<string, unknown>;
  const result =
    record.result && typeof record.result === "object"
      ? (record.result as Record<string, unknown>)
      : null;

  const resultData = result?.data;
  if (Array.isArray(resultData)) {
    return resultData;
  }

  const topLevelData = record.data;
  if (Array.isArray(topLevelData)) {
    return topLevelData;
  }

  return [];
}

function parseReasoningEfforts(item: Record<string, unknown>): ModelOption["supportedReasoningEfforts"] {
  const camel = item.supportedReasoningEfforts;
  if (Array.isArray(camel)) {
    return camel
      .map((effort) => {
        if (!effort || typeof effort !== "object") {
          return null;
        }
        const entry = effort as Record<string, unknown>;
        return {
          reasoningEffort: String(entry.reasoningEffort ?? entry.reasoning_effort ?? ""),
          description: String(entry.description ?? ""),
        };
      })
      .filter((effort): effort is { reasoningEffort: string; description: string } =>
        effort !== null,
      );
  }

  const snake = item.supported_reasoning_efforts;
  if (Array.isArray(snake)) {
    return snake
      .map((effort) => {
        if (!effort || typeof effort !== "object") {
          return null;
        }
        const entry = effort as Record<string, unknown>;
        return {
          reasoningEffort: String(entry.reasoningEffort ?? entry.reasoning_effort ?? ""),
          description: String(entry.description ?? ""),
        };
      })
      .filter((effort): effort is { reasoningEffort: string; description: string } =>
        effort !== null,
      );
  }

  return [];
}

function isGptModelSlug(model: string) {
  return /^gpt-[A-Za-z0-9][A-Za-z0-9._-]*$/i.test(model.trim());
}

export function createConfigModelOption(model: string): ModelOption {
  const supportsReasoning = isGptModelSlug(model);
  return {
    id: model,
    model,
    displayName: `${model} (config)`,
    description: CONFIG_MODEL_DESCRIPTION,
    // Some Codex CLI releases accept new GPT model slugs before app-server
    // model/list includes their metadata, so keep the UI controls usable.
    supportedReasoningEfforts: supportsReasoning ? GPT_REASONING_EFFORTS : [],
    defaultReasoningEffort: supportsReasoning ? DEFAULT_GPT_REASONING_EFFORT : null,
    isDefault: false,
  };
}

export function parseModelListResponse(response: unknown): ModelOption[] {
  const items = extractModelItems(response);

  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const modelSlug = String(record.model ?? record.id ?? "");
      const rawDisplayName = String(record.displayName || record.display_name || "");
      const displayName = rawDisplayName.trim().length > 0 ? rawDisplayName : modelSlug;
      return {
        id: String(record.id ?? record.model ?? ""),
        model: modelSlug,
        displayName,
        description: String(record.description ?? ""),
        supportedReasoningEfforts: parseReasoningEfforts(record),
        defaultReasoningEffort: normalizeEffortValue(
          record.defaultReasoningEffort ?? record.default_reasoning_effort,
        ),
        isDefault: Boolean(record.isDefault ?? record.is_default ?? false),
      } satisfies ModelOption;
    })
    .filter((model): model is ModelOption => model !== null);
}
