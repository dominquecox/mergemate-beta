import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SESSION_TOKEN_KEY = "mergemate_session_token";
const AI_CONSENT_KEY = "mergemate_ai_consent";
const RECENT_SEARCHES_KEY = "mergemate_recent_searches";

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

export const StorageService = {
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
};
