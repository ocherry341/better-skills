import React from "react";
import { Box, Text } from "ink";

export interface Shortcut {
  key: string;
  label: string;
}

interface StatusBarProps {
  shortcuts: Shortcut[];
}

export function StatusBar({ shortcuts }: StatusBarProps) {
  return (
    <Box borderStyle="single" borderTop={false} paddingX={1} gap={2}>
      {shortcuts.map((s) => (
        <Text key={s.key}>
          <Text bold color="yellow">{s.key}</Text>
          <Text dimColor>:{s.label}</Text>
        </Text>
      ))}
    </Box>
  );
}
