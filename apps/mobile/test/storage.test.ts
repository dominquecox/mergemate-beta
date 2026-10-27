import { vi, describe, it, expect, beforeEach } from "vitest";

const mockSecureStore = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => mockSecureStore.get(key) || null),
  setItemAsync: vi.fn(async (key: string, val: string) => {
    mockSecureStore.set(key, val);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
}));

import { StorageService } from "../src/storage";
import { Platform } from "react-native";

describe("StorageService", () => {
  beforeEach(async () => {
    mockSecureStore.clear();
    await StorageService.clearSessionToken();
  });

  it("sets, retrieves, and clears the session token on native", async () => {
    (Platform as any).OS = "ios";
    expect(await StorageService.getSessionToken()).toBeNull();

    await StorageService.setSessionToken("test_session_token_123");
    expect(await StorageService.getSessionToken()).toBe("test_session_token_123");

    await StorageService.clearSessionToken();
    expect(await StorageService.getSessionToken()).toBeNull();
  });

  it("never stores session token in JS on web", async () => {
    (Platform as any).OS = "web";
    await StorageService.setSessionToken("test_secret_web_token");
    expect(await StorageService.getSessionToken()).toBeNull();
    (Platform as any).OS = "ios";
  });

  it("persists the selected native appearance and rejects unknown stored values", async () => {
    Platform.OS = "ios";
    expect(await StorageService.getThemeMode()).toBe("dark");
    await StorageService.setThemeMode("light");
    expect(await StorageService.getThemeMode()).toBe("light");
    await StorageService.setThemeMode("system");
    expect(await StorageService.getThemeMode()).toBe("system");
    mockSecureStore.set("mergemate_theme", "unexpected");
    expect(await StorageService.getThemeMode()).toBe("dark");
  });

  it("stores and updates AI consent status", async () => {
    await StorageService.setAiConsent(true);
    expect(await StorageService.getAiConsent()).toBe(true);

    await StorageService.setAiConsent(false);
    expect(await StorageService.getAiConsent()).toBe(false);
  });

  it("stores and deduplicates recent search terms", async () => {
    await StorageService.addRecentSearch("stripe auth");
    await StorageService.addRecentSearch("schema migration");
    await StorageService.addRecentSearch("stripe auth");

    const searches = await StorageService.getRecentSearches();
    expect(searches[0]).toBe("stripe auth");
    expect(searches[1]).toBe("schema migration");
    expect(searches.length).toBe(2);
  });
});
