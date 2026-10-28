import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { Linking, Platform } from "react-native";
import { User, Session } from "../types";
import { StorageService } from "../storage";
import { api } from "../api";
import { ApiClientError, toUserMessage } from "../api/errors";
import { createPkcePair } from "../auth/pkce";
import { validGitHubAuthorizeUrl } from "../navigation/links";
import { refreshPushRegistration, unregisterPush } from "../push/registration";

export type SignInResult = "signed_in" | "redirected" | "failed";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isDemo: boolean;
  isLoading: boolean;
  error: string | null;
  /** Real API: sends the person to GitHub ("redirected"). Sample data: signs in at once ("signed_in"). */
  signInWithGithub: (platform: "ios" | "web") => Promise<SignInResult>;
  /** Called from the /auth/callback route with the code and state GitHub sent back. */
  completeGithubSignIn: (code: string, state: string) => Promise<boolean>;
  startDemo: () => Promise<boolean>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  clearError: () => void;
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
  const [session, setSession] = useState<Session | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const signedInRef = useRef(false);
  signedInRef.current = user !== null;
  // Set once a sign-in completes, so a slower start-up check cannot overwrite it.
  const establishedRef = useRef(false);

  const clearLocalSession = useCallback(async () => {
    establishedRef.current = false;
    await StorageService.clearSessionToken();
    await StorageService.setDemoFlag(false);
    setUser(null);
    setSession(null);
    setIsDemo(false);
  }, []);

  const initAuth = useCallback(async () => {
    try {
      // Web: the HttpOnly cookie is the session, so ask the API who is signed in.
      // Native: only a stored token can be a session.
      const token = isWeb ? null : await StorageService.getSessionToken();
      if (isWeb || token) {
        const me = await api.getMe();
        const demo = await StorageService.getDemoFlag();
        if (establishedRef.current) return;
        setUser(me);
        setSession({ expiresAt: new Date(Date.now() + SESSION_FALLBACK_MS).toISOString(), ...(demo ? { demo: true as const } : {}) });
        setIsDemo(demo);
        if (!api.isMock && !demo) {
          // Rotate the token on each launch, and keep push registered for a device that turned it on.
          api
            .refreshSession()
            .then((fresh) => setSession(fresh))
            .catch(() => undefined);
          if (!isWeb) refreshPushRegistration(api).catch(() => undefined);
        }
      }
    } catch (e) {
      if (establishedRef.current) return;
      setUser(null);
      setSession(null);
      setIsDemo(false);
      // Not signed in is normal. Only say something when the API could not be reached.
      if (e instanceof ApiClientError && ["network", "timeout", "upstream_unavailable", "not_configured"].includes(e.code)) {
        setError(e.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // When the API says the session is gone (the client has already cleared the token), return to sign-in.
  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      if (!signedInRef.current) return;
      setUser(null);
      setSession(null);
      setIsDemo(false);
      StorageService.setDemoFlag(false).catch(() => undefined);
      setError("Your session has ended. Sign in again to continue.");
    });
    return () => api.setUnauthorizedHandler(null);
  }, []);

  const establish = async (res: { session: Session; user: User }, demo: boolean) => {
    // The real client keeps the token itself. The sample-data client hands it back for us to keep.
    if (api.isMock && !isWeb && res.session.token) {
      await StorageService.setSessionToken(res.session.token);
    }
    await StorageService.setDemoFlag(demo);
    establishedRef.current = true;
    setSession(res.session);
    setUser(res.user);
    setIsDemo(demo);
    if (!demo && !api.isMock && !isWeb) refreshPushRegistration(api).catch(() => undefined);
  };

  const signInWithGithub = async (_platform: "ios" | "web"): Promise<SignInResult> => {
    setIsLoading(true);
    setError(null);
    try {
      const platform = isWeb ? "web" : "ios";
      if (api.isMock) {
        await api.startGithubAuth(platform, "mock");
        await establish(await api.completeGithubAuth("mock_code", "mock_state", "mock_verifier"), false);
        return "signed_in";
      }

      const { verifier, challenge } = await createPkcePair();
      const { authorizeUrl, state } = await api.startGithubAuth(platform, challenge);
      if (!validGitHubAuthorizeUrl(authorizeUrl, state, challenge)) throw new Error("Invalid sign-in destination");
      await StorageService.setPendingSignIn({ state, verifier, createdAt: Date.now() });
      await openAuthorizeUrl(authorizeUrl);
      return "redirected";
    } catch (e) {
      setError(toUserMessage(e, "Couldn't start sign-in. Try again."));
      return "failed";
    } finally {
      // On web the page is about to be replaced; keep the spinner until it is.
      if (!(isWeb && !api.isMock)) setIsLoading(false);
    }
  };

  const completeGithubSignIn = async (code: string, state: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const pending = await StorageService.takePendingSignIn();
      if (!pending || pending.state !== state) {
        setError("That sign-in link has expired. Start again.");
        return false;
      }
      await establish(await api.completeGithubAuth(code, state, pending.verifier), false);
      return true;
    } catch (e) {
      setError(toUserMessage(e, "Sign-in didn't finish. Try again."));
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const startDemo = async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await establish(await api.startDemoSession(), true);
      return true;
    } catch (e) {
      setError(toUserMessage(e, "Couldn't start the demo. Try again."));
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      if (!isWeb && !isDemo && !api.isMock) await unregisterPush(api).catch(() => undefined);
      await api.logout();
    } catch {
      // The local session is cleared either way.
    } finally {
      await clearLocalSession();
      setIsLoading(false);
    }
  };

  const deleteAccount = async () => {
    setIsLoading(true);
    try {
      // Throws when the API refuses, so the person is told and nothing is cleared.
      await api.deleteAccount();
    } catch (e) {
      setIsLoading(false);
      throw e;
    }
    await clearLocalSession();
    setIsLoading(false);
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
