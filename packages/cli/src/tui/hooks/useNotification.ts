import { useState, useRef, useCallback } from "react";

export type NotificationType = "success" | "error" | "loading";

export interface NotificationState {
  message: string;
  type: NotificationType;
}

export function useNotification() {
  const [notification, setNotification] =
    useState<NotificationState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setNotification(null);
  }, []);

  const show = useCallback((message: string, type: NotificationType) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setNotification({ message, type });
    if (type !== "loading") {
      const ms = type === "error" ? 5000 : 3000;
      timerRef.current = setTimeout(() => setNotification(null), ms);
    }
  }, []);

  return { notification, show, clear } as const;
}
