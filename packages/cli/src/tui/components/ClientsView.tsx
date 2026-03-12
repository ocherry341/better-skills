import React from "react";
import { Box, Text } from "ink";
import { List, type ListItem } from "./List.js";
import { StatusBar } from "./StatusBar.js";
import { useClients } from "../hooks/useClients.js";

interface ClientsViewProps {
  selectedIndex: number;
}

export function ClientsView({ selectedIndex }: ClientsViewProps) {
  const { clients, loading } = useClients();

  if (loading) return <Text>Loading clients...</Text>;

  const items: ListItem[] = clients.map((c) => ({
    key: c.id,
    label: `${c.id.padEnd(12)} ${c.path}`,
    markers: c.alwaysOn ? "(always on)" : c.enabled ? "\u2713 enabled" : "",
  }));

  return (
    <Box flexDirection="column" flexGrow={1}>
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
