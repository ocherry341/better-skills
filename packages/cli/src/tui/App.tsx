import React from "react";
import { Box, Text, useApp } from "ink";
import { useKeyboard } from "./hooks/useKeyboard.js";

export function App() {
  const { exit } = useApp();

  useKeyboard({
    onQuit: () => exit(),
  });

  return (
    <Box flexDirection="column">
      <Text bold>bsk tui</Text>
      <Text dimColor>Press q to quit</Text>
    </Box>
  );
}
