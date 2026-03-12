import React, { useState, useCallback } from "react";
import { Box, useApp, useInput } from "ink";
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
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const switchTab = useCallback((tab: TabName) => {
    setActiveTab(tab);
    setSelectedIndex(0);
    setFocusPane("left");
    setSearchMode(false);
    setSearchQuery("");
  }, []);

  // Search mode input handler
  useInput((input, key) => {
    if (!searchMode) return;

    if (key.escape) {
      setSearchMode(false);
      setSearchQuery("");
      setSelectedIndex(0);
      return;
    }
    if (key.return) {
      setSearchMode(false);
      return;
    }
    if (key.backspace || key.delete) {
      setSearchQuery((q) => q.slice(0, -1));
      setSelectedIndex(0);
      return;
    }
    if (input.length === 1 && !key.ctrl && !key.meta) {
      setSearchQuery((q) => q + input);
      setSelectedIndex(0);
    }
  }, { isActive: searchMode });

  useKeyboard({
    onQuit: () => { if (!searchMode) exit(); },
    onUp: () => { if (!searchMode) setSelectedIndex((i) => Math.max(0, i - 1)); },
    onDown: () => { if (!searchMode) setSelectedIndex((i) => i + 1); },
    onLeft: () => { if (!searchMode) setFocusPane("left"); },
    onRight: () => { if (!searchMode) setFocusPane("right"); },
    onTab: () => {
      if (searchMode) return;
      const idx = TABS.indexOf(activeTab);
      switchTab(TABS[(idx + 1) % TABS.length]);
    },
    onKey: (key) => {
      if (searchMode) return;
      const num = parseInt(key, 10);
      if (num >= 1 && num <= 4) {
        switchTab(TABS[num - 1]);
        return;
      }
      if (key === "/" && activeTab === "Skills") {
        setSearchMode(true);
        setSearchQuery("");
        setSelectedIndex(0);
      }
    },
  });

  return (
    <Box flexDirection="column" height="100%">
      <TabBar active={activeTab} version={version} />
      {activeTab === "Skills" && (
        <SkillsView
          selectedIndex={selectedIndex}
          focusPane={focusPane}
          filterQuery={searchQuery}
          searchMode={searchMode}
        />
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
