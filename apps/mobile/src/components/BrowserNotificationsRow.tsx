import React, { useCallback, useEffect, useRef, useState } from "react";
import {AccessibleSwitch as Switch} from "./AccessibleSwitch";
import { api } from "../api";
import { toUserMessage } from "../api/errors";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { browserDevice, disableWebPush, enableWebPush, webPushStatus, type WebPushStatus } from "../push/web";
import { SettingsRow } from "./SettingsRows";

const DETAIL: Record<WebPushStatus, string> = {
  off: "Get a notification in this browser when a review needs you",
  on: "On for this browser. Turn off any time.",
  blocked: "Blocked in your browser settings. Allow notifications for this site to turn it on.",
  "install-first": "On iPhone and iPad, tap Share, then Add to Home Screen, and open MergeMate from there to turn this on.",
  unsupported: "This browser can't show notifications.",
};

/** Settings row for browser notifications. Web only; it asks for permission only when the switch is tapped. */
export function BrowserNotificationsRow({ onNotice }: { onNotice?: (text: string) => void }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<WebPushStatus>("off");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const load = useCallback(async () => {
    try {
      // Hidden when this API has no key configured (the feature is off for the environment).
      const key = await api.getWebPushKey();
      if (!key) return;
      setAvailable(true);
      setStatus(await webPushStatus(browserDevice(), userId));
    } catch {
      setAvailable(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (on: boolean) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (on) {
        // First await is the permission prompt, so Safari still counts this as the tap.
        const result = await enableWebPush(api, userId);
        if (result === "unavailable") onNotice?.("Browser notifications aren't available right now.");
        setStatus(result === "enabled" ? "on" : result === "unavailable" ? "off" : result);
      } else {
        await disableWebPush(api);
        setStatus("off");
      }
    } catch (e) {
      onNotice?.(toUserMessage(e, "Couldn't change browser notifications."));
      setStatus(await webPushStatus(browserDevice(), userId).catch(() => "off" as WebPushStatus));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  if (!available) return null;
  const switchable = status === "off" || status === "on";
  return (
    <SettingsRow
      label="Browser notifications"
      detail={DETAIL[status]}
      icon="notifications-outline"
      trailing={
        <Switch
          accessibilityLabel="Browser notifications"
          value={status === "on"}
          disabled={busy || !switchable}
          onValueChange={toggle}
          trackColor={{ false: colors.surfaceSecondary, true: colors.brand }}
          thumbColor="#FFFFFF"
        />
      }
    />
  );
}
