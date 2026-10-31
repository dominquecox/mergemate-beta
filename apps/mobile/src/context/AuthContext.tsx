import { sessionEndedMessage } from "../auth/session-ended";
import {cancelReadout} from "../readout/active";
import {hideSessionForPageCache,revealSessionAfterCheck} from "../auth/page-session";
import {onSessionChange,hasPendingLogout,notifySessionChange,type SessionChange} from "../auth/session-events";
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { Linking, Platform } from "react-native";
import { User, Session } from "../types";
import { StorageService } from "../storage";
import { api } from "../api";
import { ApiClientError, toUserMessage, messageForCode } from "../api/errors";
import { createPkcePair } from "../auth/pkce";
import { validGitHubAuthorizeUrl } from "../navigation/links";
import { refreshPushRegistration } from "../push/registration";
import { dropWebPush, refreshWebPush } from "../push/web";

export type SignInResult = "signed_in" | "redirected" | "failed";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isDemo: boolean;
  isLoading: boolean;
  error: string | null;
  /** Real API: sends the person to GitHub ("redirected"). Sample data: signs in at once ("signed_in"). */
  signInWithGithub: (platform: "ios" | "android" | "web") => Promise<SignInResult>;
  /** Called from the /auth/callback route with the code and state GitHub sent back. */
  completeGithubSignIn: (code: string, state: string) => Promise<boolean>;
  startDemo: () => Promise<boolean>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  clearError: () => void;
  localCleanupPending:boolean;
  retryLocalCleanup:()=>Promise<void>;
  setError: (message: string | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const isWeb = Platform.OS === "web";
const SESSION_FALLBACK_MS = 24 * 60 * 60 * 1000;

/** Opens GitHub's authorize page: the same tab on web, the system browser on iOS. */
async function openAuthorizeUrl(url: string): Promise<void> {
  if (isWeb) {
    window.location.assign(url);
    return;
  }
  await Linking.openURL(url);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  useEffect(()=>{StorageService.setRecentSearchAccount(user?.id??null);},[user?.id]);
  const [session, setSession] = useState<Session | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [localCleanupPending,setLocalCleanupPending]=useState(false);
  const cleanupBusy=useRef(false);
  const [error, setError] = useState<string | null>(null);

  const signedInRef = useRef(false);
  signedInRef.current = user !== null;
  const demoRef = useRef(false);
  demoRef.current = isDemo;
  // Set once a sign-in completes, so a slower start-up check cannot overwrite it.
  const authVersion=useRef(0);

  const clearLocalSession=useCallback(async(version:number)=>{
    if(version!==authVersion.current)return;
    try{if(api.isMock)await StorageService.clearSessionToken();if(version!==authVersion.current)return;await StorageService.takePendingSignIn().catch(()=>null);if(version!==authVersion.current)return;await StorageService.setDemoFlag(false);}
    finally{if(version===authVersion.current){setUser(null);setSession(null);setIsDemo(false);}}
  },[]);

  const initAuth = useCallback(async (rotate=true) => {
    const version=authVersion.current;
    if(rotate && version!==0)return;
    try {
      if(await StorageService.getLocalCleanupPending()){setLocalCleanupPending(true);setError(messageForCode('local_cleanup_incomplete'));return;}
      if(isWeb && hasPendingLogout())return;
      // Web: the HttpOnly cookie is the session, so ask the API who is signed in.
      // Native: only a stored token can be a session.
      const token = isWeb ? null : await StorageService.getSessionToken();
      if (isWeb || token) {
        const me = await api.getMe();
        const demo = api.isMock ? await StorageService.getDemoFlag() : me.demo===true;
        if (version!==authVersion.current) return;
        setUser(me);
        setSession({ expiresAt: new Date(Date.now() + SESSION_FALLBACK_MS).toISOString(), ...(demo ? { demo: true as const } : {}) });
        setIsDemo(demo);
        if (!api.isMock && !demo && !me.deletionPending && rotate) {
          // Rotate the token on each launch, and keep push registered for a device that turned it on.
          api
            .refreshSession()
            .then((fresh) => {if(version===authVersion.current)setSession(fresh);})
            .catch(() => undefined);
          if (!isWeb) refreshPushRegistration(api).catch(() => undefined);
          else refreshWebPush(api, me.id).catch(() => undefined);
        }
      }
    } catch (e) {
      if (version!==authVersion.current) return;
      setUser(null);
      setSession(null);
      setIsDemo(false);
      // Not signed in is normal. Only say something when the API could not be reached.
      if (e instanceof ApiClientError && ["network", "timeout", "upstream_unavailable", "not_configured", "secure_storage_unavailable"].includes(e.code)) {
        setError(e.message);
      }
    } finally {
      if(version===authVersion.current)setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(()=>{
    const changed=(kind:SessionChange)=>{
      cancelReadout();
      ++authVersion.current;api.invalidateSession();setIsLoading(kind!=='signed-out');setUser(null);setSession(null);setIsDemo(false);
      if(kind!=='signed-out')void initAuth(false);
    };
    const unsubscribe=onSessionChange(changed);
    const restored=(event:PageTransitionEvent)=>{if(event.persisted)changed('signed-in');};
    if(isWeb){window.addEventListener('pageshow',restored);window.addEventListener('pagehide',hideSessionForPageCache);}
    return()=>{unsubscribe();if(isWeb){window.removeEventListener('pageshow',restored);window.removeEventListener('pagehide',hideSessionForPageCache);}};
  },[initAuth]);

  useEffect(()=>{if(isWeb && !isLoading)revealSessionAfterCheck();},[isLoading,user?.id]);

  // When the API says the session is gone (the client has already cleared the token), return to sign-in.
  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      if (!signedInRef.current) return;
      const wasDemo = demoRef.current;
      cancelReadout();
      ++authVersion.current;setIsLoading(false);
      setUser(null);
      setSession(null);
      setIsDemo(false);
      StorageService.setDemoFlag(false).catch(() => undefined);
      // The server removed this browser's push row with the session; stop the browser subscription too.
      if (isWeb && !api.isMock) dropWebPush().catch(() => undefined);
      setError(sessionEndedMessage(wasDemo));
    });
    return () => api.setUnauthorizedHandler(null);
  }, []);

  const establish=async(res:{session:Session;user:User},demo:boolean,version:number):Promise<boolean>=>{
    if(version!==authVersion.current)return false;
    if(api.isMock && !isWeb && res.session.token)await StorageService.setSessionToken(res.session.token);
    if(version!==authVersion.current)return false;
    await StorageService.setDemoFlag(api.isMock?demo:false);
    if(version!==authVersion.current)return false;
    setSession(res.session);setUser(res.user);setIsDemo(demo);
    if(!demo && !res.user.deletionPending && !api.isMock && !isWeb)refreshPushRegistration(api).catch(()=>undefined);
    if(!api.isMock && isWeb)(demo || res.user.deletionPending?dropWebPush():refreshWebPush(api,res.user.id)).catch(()=>undefined);
    return true;
  };

  const requireCleanLocalData=async()=>{
    if(localCleanupPending || await StorageService.getLocalCleanupPending()){setLocalCleanupPending(true);throw new ApiClientError('local_cleanup_incomplete',messageForCode('local_cleanup_incomplete'));}
  };

  const retryLocalCleanup=async()=>{
    if(cleanupBusy.current)return;cleanupBusy.current=true;
    try{await StorageService.clearSessionToken();await StorageService.clearAccountData();if(isWeb)await dropWebPush();setLocalCleanupPending(false);setError(null);}
    catch{setLocalCleanupPending(true);setError(messageForCode('local_cleanup_incomplete'));}
    finally{cleanupBusy.current=false;}
  };

  const signInWithGithub = async (_platform: "ios" | "android" | "web"): Promise<SignInResult> => {
    const version=++authVersion.current;let redirected=false;
    setIsLoading(true);
    setError(null);
    try {
      await requireCleanLocalData();
      const platform = isWeb ? "web" : Platform.OS==="android" ? "android" : "ios";
      if (api.isMock) {
        await api.startGithubAuth(platform, "mock");
        return await establish(await api.completeGithubAuth("mock_code", "mock_state", "mock_verifier"),false,version)?"signed_in":"failed";
      }

      const { verifier, challenge } = await createPkcePair();
      const { authorizeUrl, state } = await api.startGithubAuth(platform, challenge);
      if(version!==authVersion.current)return "failed";
      if (!validGitHubAuthorizeUrl(authorizeUrl, state, challenge)) throw new Error("Invalid sign-in destination");
      await StorageService.setPendingSignIn({ state, verifier, createdAt: Date.now() });
      if(version!==authVersion.current)return "failed";
      await openAuthorizeUrl(authorizeUrl);redirected=true;
      return "redirected";
    } catch (e) {
      if(version===authVersion.current)setError(toUserMessage(e, "Couldn't start sign-in. Try again."));
      return "failed";
    } finally {
      // On web the page is about to be replaced; keep the spinner until it is.
      if(version===authVersion.current && !(isWeb && !api.isMock && redirected))setIsLoading(false);
    }
  };

  const completeGithubSignIn = async (code: string, state: string): Promise<boolean> => {
    const version=++authVersion.current;
    setIsLoading(true);
    setError(null);
    try {
      await requireCleanLocalData();
      const pending = await StorageService.takePendingSignIn(Date.now(),state);
      if(version!==authVersion.current)return false;
      if (!pending || pending.state !== state) {
        setError("That sign-in link has expired. Start again.");
        return false;
      }
      return await establish(await api.completeGithubAuth(code,state,pending.verifier),false,version);
    } catch (e) {
      if(version===authVersion.current)setError(toUserMessage(e, "Sign-in didn't finish. Try again."));
      return false;
    } finally {
      if(version===authVersion.current)setIsLoading(false);
    }
  };

  const startDemo = async (): Promise<boolean> => {
    const version=++authVersion.current;
    setIsLoading(true);
    setError(null);
    try {
      await requireCleanLocalData();
      return await establish(await api.startDemoSession(),true,version);
    } catch (e) {
      if(version===authVersion.current)setError(toUserMessage(e, "Couldn't start the demo. Try again."));
      return false;
    } finally {
      if(version===authVersion.current)setIsLoading(false);
    }
  };

  const signOut = async () => {
    cancelReadout();
    const version=++authVersion.current;setError(null);setUser(null);setSession(null);setIsDemo(false);
    setIsLoading(true);
    try {
      // Revoke first; FK cascades remove push rows without a separate authenticated request.
      const revoked=api.logout();
      const localPush=(isWeb?dropWebPush():StorageService.setPushEnabled(false)).catch(()=>undefined);
      await revoked;await localPush;
    } catch (e) {
      if(version===authVersion.current)setError(toUserMessage(e,"Sign-out could not finish. Reconnect and try again."));
    } finally {
      await clearLocalSession(version);
      if(version===authVersion.current)setIsLoading(false);
    }
  };

  const deleteAccount = async () => {
    cancelReadout();
    const version=++authVersion.current;
    setIsLoading(true);
    try {
      // Throws when the API refuses, so the person is told and nothing is cleared.
      await api.deleteAccount();
    } catch (e) {
      if(e instanceof ApiClientError && e.code==='local_cleanup_incomplete'){
        if(version===authVersion.current)setLocalCleanupPending(true);
        await clearLocalSession(version);
        if(version===authVersion.current){setError(e.message);setIsLoading(false);}
        throw e;
      }
      if(version===authVersion.current){
        api.invalidateCache();const me=await api.getMe().catch(()=>null);
        if(version===authVersion.current && me?.deletionPending){setUser(me);notifySessionChange('deletion-pending');}
        if(version===authVersion.current)setIsLoading(false);
      }
      throw e;
    }
    await clearLocalSession(version);
    if(version===authVersion.current)setIsLoading(false);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isDemo,
        isLoading,
        error,
        signInWithGithub,
        completeGithubSignIn,
        startDemo,
        signOut,
        deleteAccount,
        clearError,
        localCleanupPending,
        retryLocalCleanup,
        setError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
