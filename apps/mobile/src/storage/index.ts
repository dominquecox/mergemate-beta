import {ApiClientError,messageForCode} from "../api/errors";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const REVIEW_PLAYBOOK_KEY = "mergemate_review_playbook";
const LOCAL_CLEANUP_PENDING_KEY = "mergemate_local_cleanup_pending";
const SESSION_TOKEN_KEY = "mergemate_session_token";
const AI_CONSENT_KEY = "mergemate_ai_consent";
const RECENT_SEARCHES_KEY = "mergemate_recent_searches";
const PENDING_SIGN_IN_KEY = "mergemate_pending_sign_in";
const DEMO_FLAG_KEY = "mergemate_demo_session";
const DEVICE_ID_KEY = "mergemate_device_id";
const PUSH_ENABLED_KEY = "mergemate_push_enabled";
const FIRST_RUN_KEY = "mergemate_first_run_walkthrough";

// Fallback in-memory map for environments where neither SecureStore nor localStorage is accessible
const memoryStorage = new Map<string, string>();
let recentAccount:string|null=null,recentSearches:string[]=[];
let pendingOperations=Promise.resolve();
function pendingOperation<T>(operation:()=>Promise<T>):Promise<T>{const result=pendingOperations.then(operation,operation);pendingOperations=result.then(()=>undefined,()=>undefined);return result;}
const storageUnavailable=()=>new ApiClientError("secure_storage_unavailable",messageForCode("secure_storage_unavailable"));

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
  /** Erase account-owned local data; the caller serializes credentials separately. Theme stays device-owned. */
  async clearAccountData():Promise<void>{
    await pendingOperations;
    let failed=false;
    for(const key of [REVIEW_PLAYBOOK_KEY,AI_CONSENT_KEY,RECENT_SEARCHES_KEY,DEMO_FLAG_KEY,DEVICE_ID_KEY,PUSH_ENABLED_KEY,FIRST_RUN_KEY,'mergemate.webPushUser']){
      memoryStorage.delete(key);
      try{if(Platform.OS==='web'){if(typeof window!=='undefined')window.localStorage.removeItem(key);}else await SecureStore.deleteItemAsync(key);}
      catch{failed=true;}
    }
    if(!failed){try{if(Platform.OS==='web'){if(typeof window!=='undefined')window.localStorage.removeItem(LOCAL_CLEANUP_PENDING_KEY);}else await SecureStore.deleteItemAsync(LOCAL_CLEANUP_PENDING_KEY);memoryStorage.delete(LOCAL_CLEANUP_PENDING_KEY);}catch{failed=true;}}
    if(failed){memoryStorage.set(LOCAL_CLEANUP_PENDING_KEY,'1');try{if(Platform.OS==='web'){if(typeof window!=='undefined')window.localStorage.setItem(LOCAL_CLEANUP_PENDING_KEY,'1');}else await SecureStore.setItemAsync(LOCAL_CLEANUP_PENDING_KEY,'1');}catch{/* Inaccessible storage retains the in-memory fence; manual device/site erasure remains available. */}throw storageUnavailable();}
  },

  async getLocalCleanupPending():Promise<boolean>{
    if(memoryStorage.get(LOCAL_CLEANUP_PENDING_KEY)==='1')return true;
    if(Platform.OS==='web')return getWebStorage()?.getItem(LOCAL_CLEANUP_PENDING_KEY)==='1';
    try{return await SecureStore.getItemAsync(LOCAL_CLEANUP_PENDING_KEY)==='1';}catch{throw storageUnavailable();}
  },

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
      throw storageUnavailable();
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
      throw storageUnavailable();
    }
  },

  async clearSessionToken(): Promise<void> {
    if (Platform.OS === "web") {
      // No-op: Web session cookie cleared via server response on logout
      return;
    }

    memoryStorage.delete(SESSION_TOKEN_KEY);
    try {
      await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    } catch {
      throw storageUnavailable();
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

  async shouldShowFirstRun(account: string): Promise<boolean> {
    try {
      const raw = Platform.OS === "web" ? getWebStorage()?.getItem(FIRST_RUN_KEY) ?? memoryStorage.get(FIRST_RUN_KEY) ?? null : await SecureStore.getItemAsync(FIRST_RUN_KEY) ?? memoryStorage.get(FIRST_RUN_KEY) ?? null;
      if (!raw) return true;
      const value: unknown = JSON.parse(raw);
      return !value || typeof value !== "object" || !("account" in value) || value.account !== account || !("completedAt" in value) || typeof value.completedAt !== "string";
    } catch {
      return true;
    }
  },

  async completeFirstRun(account: string, now = new Date()): Promise<void> {
    const raw = JSON.stringify({ account, completedAt: now.toISOString() });
    try {
      if (Platform.OS === "web") {
        const storage = getWebStorage();
        if (storage) storage.setItem(FIRST_RUN_KEY, raw);
        else memoryStorage.set(FIRST_RUN_KEY, raw);
      } else await SecureStore.setItemAsync(FIRST_RUN_KEY, raw);
    } catch {
      memoryStorage.set(FIRST_RUN_KEY, raw);
    }
  },

  /** One bounded local preference, account-scoped and erased with account cleanup. */
  async getReviewPlaybook(account: string): Promise<unknown> {
    try {
      const storage = Platform.OS === "web" ? getWebStorage() : null;
      if (Platform.OS === "web" && !storage) throw new Error("Local storage unavailable");
      const raw = Platform.OS === "web" ? storage!.getItem(REVIEW_PLAYBOOK_KEY) : await SecureStore.getItemAsync(REVIEW_PLAYBOOK_KEY);
      if (!raw) return null;
      if (raw.length > 1800) throw new Error("Invalid saved playbook");
      const record = JSON.parse(raw);
      return record.account === account ? record.playbook : null;
    } catch { throw new Error("Could not load your local playbook."); }
  },
  async setReviewPlaybook(account: string, playbook: unknown): Promise<void> {
    return pendingOperation(async () => {
      if (account !== recentAccount) throw new Error("Your account changed. Reopen review playbooks.");
      const raw = JSON.stringify({ account, playbook });
      if (raw.length > 1800) throw new Error("Playbook exceeds local storage limit.");
      if (Platform.OS === "web") {
        const storage = getWebStorage();
        if (!storage) throw new Error("Local storage is unavailable.");
        storage.setItem(REVIEW_PLAYBOOK_KEY, raw);
      } else await SecureStore.setItemAsync(REVIEW_PLAYBOOK_KEY, raw);
    });
  },

  /** Private query text is session-memory only, never written to browser or native storage. */
  setRecentSearchAccount(account:string|null):void {
    if(recentAccount!==account){recentAccount=account;recentSearches=[];}
    memoryStorage.delete(RECENT_SEARCHES_KEY);
    try{getWebStorage()?.removeItem(RECENT_SEARCHES_KEY);}catch{/* Never read legacy shared history. */}
    void SecureStore.deleteItemAsync(RECENT_SEARCHES_KEY).catch(()=>undefined);
  },
  async getRecentSearches(account=recentAccount):Promise<string[]>{return account!==null&&account===recentAccount?[...recentSearches]:[];},
  async addRecentSearch(query:string,account=recentAccount):Promise<void>{
    const value=query.trim();if(account===null||account!==recentAccount||!value||value.length>120)return;
    recentSearches=[value,...recentSearches.filter(item=>item.toLowerCase()!==value.toLowerCase())].slice(0,5);
  },
  async clearRecentSearches(account=recentAccount):Promise<void>{if(account===recentAccount)recentSearches=[];},

  /**
   * Sign-in in progress. Web keeps it in sessionStorage (this tab only, gone when it closes); native keeps
   * it in secure storage. It holds the PKCE verifier and state, never a session token.
   */
  async setPendingSignIn(pending: PendingSignIn): Promise<void> {
    return pendingOperation(async()=>{
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
      throw storageUnavailable();
    }
    });
  },

  /** A callback without parameters may restore a verified session only when no new intent is pending. */
  async hasPendingSignIn(now=Date.now()):Promise<boolean>{
    return pendingOperation(async()=>{
      const storage=Platform.OS==='web'?getSessionOnlyStorage():null;
      let raw:string|null;
      if(Platform.OS==='web')raw=storage?storage.getItem(PENDING_SIGN_IN_KEY):memoryStorage.get(PENDING_SIGN_IN_KEY)??null;
      else{try{raw=await SecureStore.getItemAsync(PENDING_SIGN_IN_KEY);}catch{throw storageUnavailable();}}
      try{const value:unknown=raw?JSON.parse(raw):null;return isPendingSignIn(value)&&value.createdAt<=now&&now-value.createdAt<=PENDING_SIGN_IN_TTL_MS;}catch{return false;}
    });
  },

  /** Reads and deletes the pending sign-in so a callback can be used once. Null when missing or too old. */
  async takePendingSignIn(now=Date.now(),expectedState?:string):Promise<PendingSignIn|null>{
    return pendingOperation(async()=>{
      const storage=Platform.OS==='web'?getSessionOnlyStorage():null;
      let raw:string|null;
      if(Platform.OS==='web')raw=storage?storage.getItem(PENDING_SIGN_IN_KEY):memoryStorage.get(PENDING_SIGN_IN_KEY)??null;
      else{try{raw=await SecureStore.getItemAsync(PENDING_SIGN_IN_KEY);}catch{throw storageUnavailable();}}
      let pending:PendingSignIn|null=null;
      try{const value:unknown=raw?JSON.parse(raw):null;if(isPendingSignIn(value) && value.createdAt<=now && now-value.createdAt<=PENDING_SIGN_IN_TTL_MS)pending=value;}catch{/* Invalid stored data is discarded. */}
      // A replay for another state must not burn a newer, legitimate pending flow.
      if(pending && expectedState!==undefined && pending.state!==expectedState)return null;
      if(Platform.OS==='web')storage?.removeItem(PENDING_SIGN_IN_KEY);
      else{try{await SecureStore.deleteItemAsync(PENDING_SIGN_IN_KEY);}catch{throw storageUnavailable();}}
      memoryStorage.delete(PENDING_SIGN_IN_KEY);return pending;
    });
  },

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
