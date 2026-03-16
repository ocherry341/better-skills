import React from "react";
import { Box, Text } from "ink";

export interface DetailField {
  label: string;
  value: string;
}

interface DetailPaneProps {
  fields: DetailField[];
  content?: string;
  contentTitle?: string;
  focused?: boolean;
}

export function DetailPane({ fields, content, contentTitle, focused = false }: DetailPaneProps) {
  return (
    <Box flexDirection="column" flexGrow={2} flexBasis={0} borderStyle="single" borderColor={focused ? "cyan" : "gray"} paddingX={1}>
      {fields.map((f) => (
        <Text key={f.label}>
          <Text dimColor>{f.label}: </Text>
          <Text>{f.value}</Text>
        </Text>
      ))}
      {content && (
        <Box flexDirection="column" marginTop={1}>
          {contentTitle && (
            <Text dimColor>{"\u2500\u2500\u2500 " + contentTitle + " " + "\u2500".repeat(20)}</Text>
          )}
          <Text wrap="truncate">{content}</Text>
        </Box>
      )}
    </Box>
  );
}
