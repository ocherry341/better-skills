import React, { useState, useCallback } from "react";
import { Box, useApp } from "ink";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { TabBar, TABS, type TabName } from "./components/TabBar.js";
import { SkillsView } from "./components/SkillsView.js";
import { ProfilesView } from "./components/ProfilesView.js";
import { StoreView } from "./components/StoreView.js";
import { ClientsView } from "./components/ClientsView.js";

interface AppProps {
  version: string;
}

export function App({ version }: AppProps) {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState<TabName>("Skills");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusPane, setFocusPane] = useState<"left" | "right">("left");

  const switchTab = useCallback((tab: TabName) => {
    setActiveTab(tab);
    setSelectedIndex(0);
    setFocusPane("left");
  }, []);

  useKeyboard({
    onQuit: () => exit(),
    onUp: () => setSelectedIndex((i) => Math.max(0, i - 1)),
    onDown: () => setSelectedIndex((i) => i + 1),
    onLeft: () => setFocusPane("left"),
    onRight: () => setFocusPane("right"),
    onTab: () => {
      const idx = TABS.indexOf(activeTab);
      switchTab(TABS[(idx + 1) % TABS.length]);
    },
    onKey: (key) => {
      const num = parseInt(key, 10);
      if (num >= 1 && num <= 4) {
        switchTab(TABS[num - 1]);
      }
    },
  });

  return (
    <Box flexDirection="column" height="100%">
      <TabBar active={activeTab} version={version} />
      {activeTab === "Skills" && (
        <SkillsView selectedIndex={selectedIndex} focusPane={focusPane} />
      )}
      {activeTab === "Profiles" && (
        <ProfilesView selectedIndex={selectedIndex} focusPane={focusPane} />
      )}
      {activeTab === "Store" && (
        <StoreView selectedIndex={selectedIndex} />
      )}
      {activeTab === "Clients" && (
        <ClientsView selectedIndex={selectedIndex} />
      )}
    </Box>
  );
}
