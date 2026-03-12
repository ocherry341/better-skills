import React from "react";
import { Box, Text } from "ink";

const TABS = ["Skills", "Profiles", "Store", "Clients"] as const;
export type TabName = (typeof TABS)[number];

interface TabBarProps {
  active: TabName;
  version: string;
}

export function TabBar({ active, version }: TabBarProps) {
  return (
    <Box borderStyle="single" borderBottom={false} paddingX={1} justifyContent="space-between">
      <Box gap={2}>
        {TABS.map((tab, i) => (
          <Text
            key={tab}
            bold={active === tab}
            underline={active === tab}
            dimColor={active !== tab}
          >
            {i + 1}:{tab}
          </Text>
        ))}
      </Box>
      <Text dimColor>bsk {version}</Text>
    </Box>
  );
}

export { TABS };
