import React from "react";
import { Box, Text } from "ink";

interface ModalProps {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

export function Modal({ title, children, footer, width = 70 }: ModalProps) {
  return (
    <Box justifyContent="center" paddingY={1} width="100%">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        width={width}
      >
        <Text bold>{title}</Text>
        {children}
        {footer ? <Text dimColor>{footer}</Text> : null}
      </Box>
    </Box>
  );
}
