import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { NotificationState } from "../hooks/useNotification.js";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface NotificationProps {
  notification: NotificationState | null;
}

export function Notification({ notification }: NotificationProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (notification?.type !== "loading") return;
    const timer = setInterval(
      () => setFrame((f) => (f + 1) % SPINNER.length),
      80
    );
    return () => clearInterval(timer);
  }, [notification?.type]);

  if (!notification) return null;

  const icon =
    notification.type === "loading"
      ? SPINNER[frame]
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
