import React from "react";
import { Box, Text } from "ink";
import { StatusBar } from "./StatusBar.js";
import { useStore } from "../hooks/useStore.js";

interface StoreViewProps {
  selectedIndex: number;
}

export function StoreView({ selectedIndex }: StoreViewProps) {
  const { result, loading } = useStore();

  if (loading || !result) return <Text>Verifying store...</Text>;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" flexGrow={1} padding={1}>
        <Text bold>Store Health</Text>
        <Text>
          Total: {result.total}  <Text color="green">OK: {result.ok}</Text>
          {result.corrupted.length > 0 && (
            <Text color="red">  Corrupted: {result.corrupted.length}</Text>
          )}
        </Text>
        {result.corrupted.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="red">Corrupted entries:</Text>
            {result.corrupted.map((c, i) => (
              <Text key={c.hash} inverse={i === selectedIndex}>
                <Text color="red">{"\u2717"}</Text> {c.hash.slice(0, 8)}
                {c.skills.length > 0 ? ` (${c.skills.join(", ")})` : ""}
              </Text>
            ))}
          </Box>
        )}
        {result.corrupted.length === 0 && (
          <Text color="green" bold>All store entries healthy {"\u2713"}</Text>
        )}
      </Box>
      <StatusBar shortcuts={[
        { key: "v", label: "Re-verify" },
        { key: "q", label: "Quit" },
      ]} />
    </Box>
  );
}
