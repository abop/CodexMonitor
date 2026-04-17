import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal";
import Mic from "lucide-react/dist/esm/icons/mic";
import Keyboard from "lucide-react/dist/esm/icons/keyboard";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";
import FileText from "lucide-react/dist/esm/icons/file-text";
import FlaskConical from "lucide-react/dist/esm/icons/flask-conical";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Layers from "lucide-react/dist/esm/icons/layers";
import ServerCog from "lucide-react/dist/esm/icons/server-cog";
import Bot from "lucide-react/dist/esm/icons/bot";
import Info from "lucide-react/dist/esm/icons/info";
import { PanelNavItem, PanelNavList } from "@/features/design-system/components/panel/PanelPrimitives";
import type { CodexSection } from "./settingsTypes";

type SettingsNavProps = {
  activeSection: CodexSection;
  onSelectSection: (section: CodexSection) => void;
  showDisclosure?: boolean;
  visibleSections?: readonly CodexSection[];
};

export function SettingsNav({
  activeSection,
  onSelectSection,
  showDisclosure = false,
  visibleSections,
}: SettingsNavProps) {
  const renderSection = (section: CodexSection) =>
    !visibleSections || visibleSections.includes(section);

  return (
    <aside className="settings-sidebar">
      <PanelNavList className="settings-nav-list">
        {renderSection("projects") && (
          <PanelNavItem
            className="settings-nav"
            icon={<LayoutGrid aria-hidden />}
            active={activeSection === "projects"}
            showDisclosure={showDisclosure}
            onClick={() => onSelectSection("projects")}
          >
            Projects
          </PanelNavItem>
        )}
        {renderSection("environments") && (
          <PanelNavItem
            className="settings-nav"
            icon={<Layers aria-hidden />}
            active={activeSection === "environments"}
            showDisclosure={showDisclosure}
            onClick={() => onSelectSection("environments")}
          >
            Environments
          </PanelNavItem>
        )}
        {renderSection("display") && (
          <PanelNavItem
            className="settings-nav"
            icon={<SlidersHorizontal aria-hidden />}
            active={activeSection === "display"}
            showDisclosure={showDisclosure}
            onClick={() => onSelectSection("display")}
          >
            Display &amp; Sound
          </PanelNavItem>
        )}
        {renderSection("composer") && (
          <PanelNavItem
            className="settings-nav"
            icon={<FileText aria-hidden />}
            active={activeSection === "composer"}
            showDisclosure={showDisclosure}
            onClick={() => onSelectSection("composer")}
          >
            Composer
          </PanelNavItem>
        )}
        {renderSection("dictation") && (
          <PanelNavItem
            className="settings-nav"
            icon={<Mic aria-hidden />}
            active={activeSection === "dictation"}
            showDisclosure={showDisclosure}
            onClick={() => onSelectSection("dictation")}
          >
            Dictation
          </PanelNavItem>
        )}
        {renderSection("shortcuts") && (
          <PanelNavItem
            className="settings-nav"
            icon={<Keyboard aria-hidden />}
            active={activeSection === "shortcuts"}
            showDisclosure={showDisclosure}
            onClick={() => onSelectSection("shortcuts")}
          >
            Shortcuts
          </PanelNavItem>
        )}
        {renderSection("open-apps") && (
          <PanelNavItem
            className="settings-nav"
            icon={<ExternalLink aria-hidden />}
            active={activeSection === "open-apps"}
            showDisclosure={showDisclosure}
            onClick={() => onSelectSection("open-apps")}
          >
            Open in
          </PanelNavItem>
        )}
        {renderSection("git") && (
          <PanelNavItem
            className="settings-nav"
            icon={<GitBranch aria-hidden />}
            active={activeSection === "git"}
            showDisclosure={showDisclosure}
            onClick={() => onSelectSection("git")}
          >
            Git
          </PanelNavItem>
        )}
        {renderSection("server") && (
          <PanelNavItem
            className="settings-nav"
            icon={<ServerCog aria-hidden />}
            active={activeSection === "server"}
            showDisclosure={showDisclosure}
            onClick={() => onSelectSection("server")}
          >
            Server
          </PanelNavItem>
        )}
        {renderSection("agents") && (
          <PanelNavItem
            className="settings-nav"
            icon={<Bot aria-hidden />}
            active={activeSection === "agents"}
            showDisclosure={showDisclosure}
            onClick={() => onSelectSection("agents")}
          >
            Agents
          </PanelNavItem>
        )}
        {renderSection("codex") && (
          <PanelNavItem
            className="settings-nav"
            icon={<TerminalSquare aria-hidden />}
            active={activeSection === "codex"}
            showDisclosure={showDisclosure}
            onClick={() => onSelectSection("codex")}
          >
            Codex
          </PanelNavItem>
        )}
        {renderSection("features") && (
          <PanelNavItem
            className="settings-nav"
            icon={<FlaskConical aria-hidden />}
            active={activeSection === "features"}
            showDisclosure={showDisclosure}
            onClick={() => onSelectSection("features")}
          >
            Features
          </PanelNavItem>
        )}
        {renderSection("about") && (
          <PanelNavItem
            className="settings-nav"
            icon={<Info aria-hidden />}
            active={activeSection === "about"}
            showDisclosure={showDisclosure}
            onClick={() => onSelectSection("about")}
          >
            About
          </PanelNavItem>
        )}
      </PanelNavList>
    </aside>
  );
}
