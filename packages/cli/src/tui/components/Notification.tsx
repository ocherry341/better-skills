import React from "react";
import { Box, Text } from "ink";
import type { NotificationState } from "../hooks/useNotification.js";

interface NotificationProps {
  notification: NotificationState | null;
}

export function Notification({ notification }: NotificationProps) {
  if (!notification) return null;

  const icon =
    notification.type === "loading"
      ? "…"
      : notification.type === "success"
        ? "\u2713"
        : "\u2717";

  const color =
    notification.type === "loading"
      ? "yellow"
      : notification.type === "success"
        ? "green"
        : "red";

  return (
    <Box paddingX={1}>
      <Text color={color}>
        {icon} {notification.message}
      </Text>
    </Box>
  );
}
