import type { ReactNode } from "react";

import {
  PanelFrame,
  PanelHeader,
} from "../../design-system/components/panel/PanelPrimitives";
import {
  DEFAULT_PANEL_TABS,
  PanelTabs,
  type PanelTabId,
} from "./PanelTabs";

type PanelShellProps = {
  filePanelMode: PanelTabId;
  onFilePanelModeChange: (mode: PanelTabId) => void;
  showFilesTab?: boolean;
  className?: string;
  headerClassName?: string;
  headerRight?: ReactNode;
  search?: ReactNode;
  children: ReactNode;
};

export function PanelShell({
  filePanelMode,
  onFilePanelModeChange,
  showFilesTab = true,
  className,
  headerClassName,
  headerRight,
  search,
  children,
}: PanelShellProps) {
  const tabs = showFilesTab
    ? DEFAULT_PANEL_TABS
    : DEFAULT_PANEL_TABS.filter((tab) => tab.id !== "files");

  return (
    <PanelFrame className={className}>
      <PanelHeader className={headerClassName}>
        <PanelTabs active={filePanelMode} onSelect={onFilePanelModeChange} tabs={tabs} />
        {headerRight}
      </PanelHeader>
      {search}
      {children}
    </PanelFrame>
  );
}
