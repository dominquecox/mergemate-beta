import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "./AuthContext";
import type { Notification } from "../types";

export interface AlertsContextValue {
  unreadCount: number;
  isRead: (item: Pick<Notification, "id" | "read">) => boolean;
  markRead: (id: string) => void;
  markUnread: (ids: string[]) => void;
  markAllRead: (ids: string[]) => void;
  syncItems: (items: Notification[]) => void;
}

const AlertsContext = createContext<AlertsContextValue>({
  unreadCount: 0,
  isRead: (item) => Boolean(item.read),
  markRead: () => {},
  markUnread: () => {},
  markAllRead: () => {},
  syncItems: () => {},
});

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { user, session } = useAuth();
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [knownItems, setKnownItems] = useState<Notification[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Reset per user session
  useEffect(() => {
    setReadIds(new Set());
    setKnownItems([]);
    if (!session || !user?.id) return;
    let active = true;
    api
      .getNotificationPage("all", null)
      .then((page) => {
        if (!active || !mounted.current) return;
        setKnownItems(page.items);
        setReadIds((prev) => {
          const next = new Set(prev);
          for (const item of page.items) {
            if (item.read) next.add(item.id);
          }
          return next;
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session, user?.id]);

  const syncItems = useCallback((items: Notification[]) => {
    setKnownItems((prev) => {
      const map = new Map<string, Notification>();
      for (const item of prev) map.set(item.id, item);
      for (const item of items) map.set(item.id, item);
      return [...map.values()];
    });
    setReadIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const item of items) {
        if (item.read && !next.has(item.id)) {
          next.add(item.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const markUnread = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const markAllRead = useCallback((ids: string[]) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const isRead = useCallback(
    (item: Pick<Notification, "id" | "read">) => Boolean(item.read) || readIds.has(item.id),
    [readIds],
  );

  const unreadCount = useMemo(
    () => knownItems.filter((item) => !item.read && !readIds.has(item.id)).length,
    [knownItems, readIds],
  );

  const value = useMemo<AlertsContextValue>(
    () => ({
      unreadCount,
      isRead,
      markRead,
      markUnread,
      markAllRead,
      syncItems,
    }),
    [unreadCount, isRead, markRead, markUnread, markAllRead, syncItems],
  );

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export function useAlerts(): AlertsContextValue {
  return useContext(AlertsContext);
}
