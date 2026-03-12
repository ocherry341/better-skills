import React, { useState } from "react";
import { Box, Text, useApp } from "ink";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { TabBar, TABS, type TabName } from "./components/TabBar.js";

interface AppProps {
  version: string;
}

export function App({ version }: AppProps) {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState<TabName>("Skills");

  useKeyboard({
    onQuit: () => exit(),
    onTab: () => {
      const idx = TABS.indexOf(activeTab);
      setActiveTab(TABS[(idx + 1) % TABS.length]);
    },
    onKey: (key) => {
      const num = parseInt(key, 10);
      if (num >= 1 && num <= 4) {
        setActiveTab(TABS[num - 1]);
      }
    },
  });

  return (
    <Box flexDirection="column">
      <TabBar active={activeTab} version={version} />
      <Box borderStyle="single" borderTop={false} padding={1} flexGrow={1}>
        <Text>{activeTab} view (coming soon)</Text>
      </Box>
    </Box>
  );
}
