import { readGlobalAgentsMd, writeGlobalAgentsMd } from "@services/tauri";
import { useFileEditor } from "@/features/shared/hooks/useFileEditor";

type UseGlobalAgentsMdOptions = {
  enabled?: boolean;
};

export function useGlobalAgentsMd({ enabled = true }: UseGlobalAgentsMdOptions = {}) {
  return useFileEditor({
    key: enabled ? "global-agents" : null,
    read: readGlobalAgentsMd,
    write: writeGlobalAgentsMd,
    readErrorTitle: "Couldn’t load global AGENTS.md",
    writeErrorTitle: "Couldn’t save global AGENTS.md",
  });
}
