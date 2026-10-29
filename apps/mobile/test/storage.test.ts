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

import * as SecureStore from "expo-secure-store";
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
  it("fails closed rather than keeping native session credentials outside secure storage",async()=>{
    Platform.OS="ios";
    vi.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("private-platform-detail"));
    await expect(StorageService.setSessionToken("fixture-token")).rejects.toMatchObject({code:"secure_storage_unavailable"});
    expect(mockSecureStore.has("mergemate_session_token")).toBe(false);
    vi.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error("private-platform-detail"));
    await expect(StorageService.getSessionToken()).rejects.toMatchObject({code:"secure_storage_unavailable"});
  });
  it("consumes native pending PKCE state only once under concurrent callbacks",async()=>{
    Platform.OS="ios";await StorageService.setPendingSignIn({state:"fixture",verifier:"v".repeat(43),createdAt:Date.now()});
    const results=await Promise.all([StorageService.takePendingSignIn(),StorageService.takePendingSignIn()]);
    expect(results.filter(Boolean)).toHaveLength(1);expect(results.filter(x=>x===null)).toHaveLength(1);
  });

  it("does not burn a newer pending flow when an old callback is replayed",async()=>{
    Platform.OS="ios";await StorageService.setPendingSignIn({state:"latest",verifier:"v".repeat(43),createdAt:Date.now()});
    expect(await StorageService.takePendingSignIn(Date.now(),"old")).toBeNull();
    expect((await StorageService.takePendingSignIn(Date.now(),"latest"))?.state).toBe("latest");
  });

});

describe('account-owned local erasure',()=>{
 it('removes account preferences and recent searches while preserving device theme and separately managed credentials',async()=>{
  Object.defineProperty(Platform,'OS',{configurable:true,writable:true,value:'ios'});
  for(const key of ['mergemate_ai_consent','mergemate_recent_searches','mergemate_demo_session','mergemate_device_id','mergemate_push_enabled','mergemate.webPushUser'])mockSecureStore.set(key,'fixture-private');
  mockSecureStore.set('mergemate_theme','dark');mockSecureStore.set('mergemate_session_token','separately-managed-fixture');await StorageService.clearAccountData();expect([...mockSecureStore.keys()].sort()).toEqual(['mergemate_session_token','mergemate_theme']);
 });
 it('reports a secure device cleanup failure after trying every account key',async()=>{
  Object.defineProperty(Platform,'OS',{configurable:true,writable:true,value:'ios'});vi.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error('Device unavailable'));await expect(StorageService.clearAccountData()).rejects.toMatchObject({code:'secure_storage_unavailable'});expect(await StorageService.getLocalCleanupPending()).toBe(true);await StorageService.clearAccountData();expect(await StorageService.getLocalCleanupPending()).toBe(false);
 });
});
