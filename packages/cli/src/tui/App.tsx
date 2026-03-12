import React, { useState } from "react";
import { Box, Text, useApp } from "ink";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { TabBar, TABS, type TabName } from "./components/TabBar.js";
import { SkillsView } from "./components/SkillsView.js";

interface AppProps {
  version: string;
}

export function App({ version }: AppProps) {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState<TabName>("Skills");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusPane, setFocusPane] = useState<"left" | "right">("left");

  useKeyboard({
    onQuit: () => exit(),
    onUp: () => setSelectedIndex((i) => Math.max(0, i - 1)),
    onDown: () => setSelectedIndex((i) => i + 1),
    onLeft: () => setFocusPane("left"),
    onRight: () => setFocusPane("right"),
    onTab: () => {
      const idx = TABS.indexOf(activeTab);
      setActiveTab(TABS[(idx + 1) % TABS.length]);
      setSelectedIndex(0);
      setFocusPane("left");
    },
    onKey: (key) => {
      const num = parseInt(key, 10);
      if (num >= 1 && num <= 4) {
        setActiveTab(TABS[num - 1]);
        setSelectedIndex(0);
        setFocusPane("left");
      }
    },
  });

  return (
    <Box flexDirection="column">
      <TabBar active={activeTab} version={version} />
      {activeTab === "Skills" && (
        <SkillsView selectedIndex={selectedIndex} focusPane={focusPane} />
      )}
      {activeTab !== "Skills" && (
        <Box borderStyle="single" borderTop={false} padding={1} flexGrow={1}>
          <Text>{activeTab} view (coming soon)</Text>
        </Box>
      )}
    </Box>
  );
}
