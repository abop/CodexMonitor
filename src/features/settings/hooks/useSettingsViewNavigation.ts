import { useCallback, useEffect, useState } from "react";
import type { CodexSection } from "@settings/components/settingsTypes";
import { SETTINGS_MOBILE_BREAKPOINT_PX } from "@settings/components/settingsViewConstants";
import { isNarrowSettingsViewport } from "@settings/components/settingsViewHelpers";

type UseSettingsViewNavigationParams = {
  initialSection?: CodexSection;
  visibleSections?: readonly CodexSection[];
};

function isSectionVisible(
  section: CodexSection,
  visibleSections?: readonly CodexSection[],
) {
  return visibleSections ? visibleSections.includes(section) : true;
}

function resolveInitialSection(
  initialSection: CodexSection | undefined,
  visibleSections?: readonly CodexSection[],
) {
  if (initialSection && isSectionVisible(initialSection, visibleSections)) {
    return initialSection;
  }
  return visibleSections?.[0] ?? "projects";
}

export const useSettingsViewNavigation = ({
  initialSection,
  visibleSections,
}: UseSettingsViewNavigationParams) => {
  const [activeSection, setActiveSection] = useState<CodexSection>(() =>
    resolveInitialSection(initialSection, visibleSections),
  );
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    isNarrowSettingsViewport(),
  );
  const [showMobileDetail, setShowMobileDetail] = useState(Boolean(initialSection));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(`(max-width: ${SETTINGS_MOBILE_BREAKPOINT_PX}px)`);
    const applyViewportState = () => {
      setIsNarrowViewport(query.matches);
    };
    applyViewportState();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", applyViewportState);
      return () => {
        query.removeEventListener("change", applyViewportState);
      };
    }
    query.addListener(applyViewportState);
    return () => {
      query.removeListener(applyViewportState);
    };
  }, []);

  const useMobileMasterDetail = isNarrowViewport;

  useEffect(() => {
    if (useMobileMasterDetail) {
      return;
    }
    setShowMobileDetail(false);
  }, [useMobileMasterDetail]);

  useEffect(() => {
    if (visibleSections && !visibleSections.includes(activeSection)) {
      setActiveSection(visibleSections[0] ?? "projects");
      return;
    }
    if (initialSection) {
      setActiveSection(resolveInitialSection(initialSection, visibleSections));
      if (useMobileMasterDetail) {
        setShowMobileDetail(true);
      }
    }
  }, [activeSection, initialSection, useMobileMasterDetail, visibleSections]);

  const handleSelectSection = useCallback(
    (section: CodexSection) => {
      if (!isSectionVisible(section, visibleSections)) {
        return;
      }
      setActiveSection(section);
      if (useMobileMasterDetail) {
        setShowMobileDetail(true);
      }
    },
    [useMobileMasterDetail, visibleSections],
  );

  return {
    activeSection,
    showMobileDetail,
    setShowMobileDetail,
    useMobileMasterDetail,
    handleSelectSection,
  };
};
