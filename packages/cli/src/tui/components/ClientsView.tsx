import React from "react";
import { Box, Text, useInput } from "ink";
import { List, type ListItem } from "./List.js";
import { StatusBar } from "./StatusBar.js";
import { useClients } from "../hooks/useClients.js";

interface ClientsViewProps {
  selectedIndex: number;
  onEnableClient?: (clientId: string) => void;
  onDisableClient?: (clientId: string) => void;
  refreshKey?: number;
}

export function ClientsView({ selectedIndex, onEnableClient, onDisableClient, refreshKey = 0 }: ClientsViewProps) {
  const { clients, loading } = useClients(refreshKey);
  const selected = clients[selectedIndex];

  useInput((input) => {
    if (!selected || selected.alwaysOn) return;
    if (input === "a" && !selected.enabled && onEnableClient) {
      onEnableClient(selected.id);
    }
    if (input === "d" && selected.enabled && onDisableClient) {
      onDisableClient(selected.id);
    }
  });

  if (loading) return <Text>Loading clients...</Text>;

  const items: ListItem[] = clients.map((c) => ({
    key: c.id,
    label: `${c.id.padEnd(12)} ${c.path}`,
    markers: c.alwaysOn ? "(always on)" : c.enabled ? "\u2713 enabled" : "",
  }));

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      <Box flexGrow={1}>
        <List items={items} selectedIndex={selectedIndex} title="Clients" focused={true} />
      </Box>
      <StatusBar shortcuts={[
        { key: "a", label: "Enable" },
        { key: "d", label: "Disable" },
        { key: "q", label: "Quit" },
      ]} />
    </Box>
  );
}
