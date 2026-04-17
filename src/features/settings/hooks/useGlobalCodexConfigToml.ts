import { readGlobalCodexConfigToml, writeGlobalCodexConfigToml } from "@services/tauri";
import { useFileEditor } from "@/features/shared/hooks/useFileEditor";

type UseGlobalCodexConfigTomlOptions = {
  enabled?: boolean;
};

export function useGlobalCodexConfigToml({
  enabled = true,
}: UseGlobalCodexConfigTomlOptions = {}) {
  return useFileEditor({
    key: enabled ? "global-config" : null,
    read: readGlobalCodexConfigToml,
    write: writeGlobalCodexConfigToml,
    readErrorTitle: "Couldn’t load global config.toml",
    writeErrorTitle: "Couldn’t save global config.toml",
  });
}
