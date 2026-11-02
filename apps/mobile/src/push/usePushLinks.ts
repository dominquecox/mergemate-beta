import {api} from '../api';
import {refreshPushRegistration} from './registration';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { pushPrPath } from './links';

/** Listeners live only for a signed-in identity; PR reads still enforce that identity's access. */
export function usePushLinks(identity: string | undefined) {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS === 'web' || !identity) return;
    const notifications = require('expo-notifications') as typeof import('expo-notifications');
    let active = true;
    const seen = new Set<string>();
    const open = (response: import('expo-notifications').NotificationResponse | null) => {
      if (!active || !response || response.actionIdentifier !== notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const id = response.notification.request.identifier;
      if (seen.has(id)) return;
      seen.add(id);
      const path = pushPrPath(response.notification.request.content.data);
      void notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      if (path) router.push(path);
    };
    const subscription = notifications.addNotificationResponseReceivedListener(open);
    const tokens=notifications.addPushTokenListener(()=>{if(active)void refreshPushRegistration(api).catch(()=>undefined);});
    void notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    return () => { active = false; subscription.remove(); tokens.remove(); };
  }, [identity, router]);
}
