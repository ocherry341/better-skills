import React from "react";
import { Box, Text, useInput } from "ink";
import { StatusBar } from "./StatusBar.js";
import { Notification } from "./Notification.js";
import type { NotificationState } from "../hooks/useNotification.js";
import { useStore } from "../hooks/useStore.js";

interface StoreViewProps {
  selectedIndex: number;
  notification?: NotificationState | null;
}

export function StoreView({ selectedIndex, notification = null }: StoreViewProps) {
  const { result, loading, refresh } = useStore();

  useInput((input) => {
    if (input === "v") {
      refresh();
    }
  });

  if (loading || !result) return <Text>Verifying store...</Text>;

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1}>
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
      <Notification notification={notification} />
      <StatusBar shortcuts={[
        { key: "v", label: "Re-verify" },
        { key: "?", label: "Help" },
        { key: "q", label: "Quit" },
      ]} />
    </Box>
  );
}
