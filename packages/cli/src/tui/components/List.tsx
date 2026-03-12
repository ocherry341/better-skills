import React from "react";
import { Box, Text } from "ink";

export interface ListItem {
  key: string;
  label: string;
  markers?: string;
}

interface ListProps {
  items: ListItem[];
  selectedIndex: number;
  title?: string;
  focused?: boolean;
}

export function List({ items, selectedIndex, title, focused = true }: ListProps) {
  return (
    <Box flexDirection="column" flexGrow={1} flexBasis={0}>
      {title && (
        <Text bold>{title} ({items.length})</Text>
      )}
      {items.length === 0 && <Text dimColor>(empty)</Text>}
      {items.map((item, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Text
            key={item.key}
            inverse={isSelected && focused}
            dimColor={isSelected && !focused}
          >
            {isSelected ? "\u25B8 " : "  "}
            {item.label}
            {item.markers ? `  ${item.markers}` : ""}
          </Text>
        );
      })}
    </Box>
  );
}
