import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SESSION_TOKEN_KEY = "mergemate_session_token";
const AI_CONSENT_KEY = "mergemate_ai_consent";
const RECENT_SEARCHES_KEY = "mergemate_recent_searches";
const PENDING_SIGN_IN_KEY = "mergemate_pending_sign_in";
const DEMO_FLAG_KEY = "mergemate_demo_session";
const DEVICE_ID_KEY = "mergemate_device_id";
const PUSH_ENABLED_KEY = "mergemate_push_enabled";

// Fallback in-memory map for environments where neither SecureStore nor localStorage is accessible
const memoryStorage = new Map<string, string>();

function getWebStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // blocked or unavailable
  }
  return null;
}

function getSessionOnlyStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    // blocked or unavailable
  }
  return null;
}

/** The one-time values that must survive the trip to GitHub and back. Single use, ten minutes. */
export interface PendingSignIn {
  state: string;
  verifier: string;
  createdAt: number;
}

export const PENDING_SIGN_IN_TTL_MS = 10 * 60 * 1000;

function isPendingSignIn(value: unknown): value is PendingSignIn {
  const v = value as Partial<PendingSignIn> | null;
  return !!v && typeof v.state === "string" && typeof v.verifier === "string" && typeof v.createdAt === "number";
}

export const StorageService = {
  async getThemeMode(): Promise<"dark" | "light" | "system"> {
    try {
      const value = Platform.OS === "web" ? getWebStorage()?.getItem("mergemate_theme") : await SecureStore.getItemAsync("mergemate_theme");
      return value === "light" || value === "system" ? value : "dark";
    } catch { return "dark"; }
  },
  async setThemeMode(mode: "dark" | "light" | "system"): Promise<void> {
    try {
      if (Platform.OS === "web") getWebStorage()?.setItem("mergemate_theme", mode);
      else await SecureStore.setItemAsync("mergemate_theme", mode);
    } catch { /* The current preference still applies if persistence is unavailable. */ }
  },

  /**
   * Session tokens:
   * Web must NEVER store or read the session token in JavaScript or localStorage.
   * Web authentication relies strictly on the HttpOnly `__Host-mm_session` cookie.
   * Native (iOS/Android) stores the session token exclusively in SecureStore.
   */
  async getSessionToken(): Promise<string | null> {
    if (Platform.OS === "web") {
      return null;
    }

    try {
      return await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    } catch {
      return memoryStorage.get(SESSION_TOKEN_KEY) || null;
    }
  },

  async setSessionToken(token: string): Promise<void> {
    if (Platform.OS === "web") {
      // No-op: Web must never hold or persist the session token in JS or localStorage
      return;
    }

    try {
      await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
    } catch {
      memoryStorage.set(SESSION_TOKEN_KEY, token);
    }
  },

  async clearSessionToken(): Promise<void> {
    if (Platform.OS === "web") {
      // No-op: Web session cookie cleared via server response on logout
      return;
    }

    try {
      await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    } catch {
      memoryStorage.delete(SESSION_TOKEN_KEY);
    }
  },

  async getAiConsent(): Promise<boolean> {
    if (Platform.OS === "web") {
      const storage = getWebStorage();
      return storage ? storage.getItem(AI_CONSENT_KEY) === "true" : memoryStorage.get(AI_CONSENT_KEY) === "true";
    }

    try {
      const val = await SecureStore.getItemAsync(AI_CONSENT_KEY);
      return val === "true";
    } catch {
      return memoryStorage.get(AI_CONSENT_KEY) === "true";
    }
  },

  async setAiConsent(granted: boolean): Promise<void> {
    const val = granted ? "true" : "false";
    if (Platform.OS === "web") {
      const storage = getWebStorage();
      if (storage) storage.setItem(AI_CONSENT_KEY, val);
      else memoryStorage.set(AI_CONSENT_KEY, val);
      return;
    }

    try {
      await SecureStore.setItemAsync(AI_CONSENT_KEY, val);
    } catch {
      memoryStorage.set(AI_CONSENT_KEY, val);
    }
  },

  async getRecentSearches(): Promise<string[]> {
    try {
      let raw: string | null = null;
      if (Platform.OS === "web") {
        const storage = getWebStorage();
        raw = storage ? storage.getItem(RECENT_SEARCHES_KEY) : memoryStorage.get(RECENT_SEARCHES_KEY) || null;
      } else {
        raw = await SecureStore.getItemAsync(RECENT_SEARCHES_KEY);
      }
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // ignore
    }
    return [];
  },

  async addRecentSearch(query: string): Promise<void> {
    try {
      const existing = await this.getRecentSearches();
      const updated = [query, ...existing.filter((q) => q.toLowerCase() !== query.toLowerCase())].slice(0, 5);
      const val = JSON.stringify(updated);
      if (Platform.OS === "web") {
        const storage = getWebStorage();
        if (storage) storage.setItem(RECENT_SEARCHES_KEY, val);
        else memoryStorage.set(RECENT_SEARCHES_KEY, val);
      } else {
        await SecureStore.setItemAsync(RECENT_SEARCHES_KEY, val);
      }
    } catch {
      // ignore
    }
  },

  /**
   * Sign-in in progress. Web keeps it in sessionStorage (this tab only, gone when it closes); native keeps
   * it in secure storage. It holds the PKCE verifier and state, never a session token.
   */
  async setPendingSignIn(pending: PendingSignIn): Promise<void> {
    const raw = JSON.stringify(pending);
    if (Platform.OS === "web") {
      const storage = getSessionOnlyStorage();
      if (storage) storage.setItem(PENDING_SIGN_IN_KEY, raw);
      else memoryStorage.set(PENDING_SIGN_IN_KEY, raw);
      return;
    }
    try {
      await SecureStore.setItemAsync(PENDING_SIGN_IN_KEY, raw);
    } catch {
      memoryStorage.set(PENDING_SIGN_IN_KEY, raw);
    }
  },

  /** Reads and deletes the pending sign-in so a callback can be used once. Null when missing or too old. */
  async takePendingSignIn(now: number = Date.now()): Promise<PendingSignIn | null> {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      const storage = getSessionOnlyStorage();
      raw = storage ? storage.getItem(PENDING_SIGN_IN_KEY) : (memoryStorage.get(PENDING_SIGN_IN_KEY) ?? null);
      try {
        storage?.removeItem(PENDING_SIGN_IN_KEY);
      } catch {
        // ignore
      }
      memoryStorage.delete(PENDING_SIGN_IN_KEY);
    } else {
      try {
        raw = await SecureStore.getItemAsync(PENDING_SIGN_IN_KEY);
        await SecureStore.deleteItemAsync(PENDING_SIGN_IN_KEY);
      } catch {
        raw = memoryStorage.get(PENDING_SIGN_IN_KEY) ?? null;
      }
      memoryStorage.delete(PENDING_SIGN_IN_KEY);
    }
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isPendingSignIn(parsed) || parsed.createdAt > now || now - parsed.createdAt > PENDING_SIGN_IN_TTL_MS) return null;
      return parsed;
    } catch {
      return null;
    }
  },

  /** Whether the restored session is a demo session. A plain flag, not a credential. */
  async getDemoFlag(): Promise<boolean> {
    try {
      if (Platform.OS === "web") {
        const storage = getWebStorage();
        return (storage ? storage.getItem(DEMO_FLAG_KEY) : memoryStorage.get(DEMO_FLAG_KEY)) === "true";
      }
      return (await SecureStore.getItemAsync(DEMO_FLAG_KEY)) === "true";
    } catch {
      return memoryStorage.get(DEMO_FLAG_KEY) === "true";
    }
  },

  async setDemoFlag(isDemo: boolean): Promise<void> {
    const val = isDemo ? "true" : "false";
    try {
      if (Platform.OS === "web") {
        const storage = getWebStorage();
        if (storage) storage.setItem(DEMO_FLAG_KEY, val);
        else memoryStorage.set(DEMO_FLAG_KEY, val);
        return;
      }
      await SecureStore.setItemAsync(DEMO_FLAG_KEY, val);
    } catch {
      memoryStorage.set(DEMO_FLAG_KEY, val);
    }
  },

  /** Random id for this install, used to register and remove its push token. Native only. */
  async getDeviceId(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(DEVICE_ID_KEY);
    } catch {
      return memoryStorage.get(DEVICE_ID_KEY) ?? null;
    }
  },

  async setDeviceId(id: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
    } catch {
      memoryStorage.set(DEVICE_ID_KEY, id);
    }
  },

  /** Whether the person turned push on for this device. */
  async getPushEnabled(): Promise<boolean> {
    try {
      return (await SecureStore.getItemAsync(PUSH_ENABLED_KEY)) === "true";
    } catch {
      return memoryStorage.get(PUSH_ENABLED_KEY) === "true";
    }
  },

  async setPushEnabled(enabled: boolean): Promise<void> {
    const val = enabled ? "true" : "false";
    try {
      await SecureStore.setItemAsync(PUSH_ENABLED_KEY, val);
    } catch {
      memoryStorage.set(PUSH_ENABLED_KEY, val);
    }
  },
};
