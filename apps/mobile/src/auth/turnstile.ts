import { Platform } from "react-native";
import { ApiClientError, messageForCode } from "../api/errors";

/**
 * Turnstile bot check for the two public writes that need one (the demo and the support form).
 * Web renders Cloudflare's widget with the public site key from EXPO_PUBLIC_TURNSTILE_SITE_KEY.
 * Native has no widget in this build, so it reports the check as unavailable.
 */
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TIMEOUT_MS = 90_000;

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function unavailable(): ApiClientError {
  return new ApiClientError("bot_check_unavailable", messageForCode("bot_check_unavailable"));
}

function loadScript(): Promise<TurnstileApi> {
  const existing = (globalThis as { turnstile?: TurnstileApi }).turnstile;
  if (existing) return Promise.resolve(existing);
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        const api = (globalThis as { turnstile?: TurnstileApi }).turnstile;
        if (api) resolve(api);
        else reject(unavailable());
      };
      script.onerror = () => reject(unavailable());
      document.head.appendChild(script);
    }).catch((e) => {
      scriptPromise = null;
      throw e;
    });
  }
  return scriptPromise;
}

export async function getTurnstileToken(): Promise<string> {
  const siteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  if (Platform.OS !== "web" || typeof document === "undefined" || !siteKey) throw unavailable();

  const turnstile = await loadScript();
  return new Promise<string>((resolve, reject) => {
    // A small box at the bottom of the page; it only shows if Cloudflare needs the person to interact.
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:10000";
    document.body.appendChild(container);

    let widgetId: string | null = null;
    const finish = (settle: () => void) => {
      clearTimeout(timer);
      if (widgetId) {
        try {
          turnstile.remove(widgetId);
        } catch {
          // already gone
        }
      }
      container.remove();
      settle();
    };
    const timer = setTimeout(() => finish(() => reject(unavailable())), TIMEOUT_MS);

    try {
      widgetId = turnstile.render(container, {
        sitekey: siteKey,
        appearance: "interaction-only",
        callback: (token: string) => finish(() => resolve(token)),
        "error-callback": () => finish(() => reject(unavailable())),
        "timeout-callback": () => finish(() => reject(unavailable())),
        "expired-callback": () => finish(() => reject(unavailable())),
      });
    } catch {
      finish(() => reject(unavailable()));
    }
  });
}
