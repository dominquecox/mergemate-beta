import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import { User, Session } from "../types";
import { StorageService } from "../storage";
import { api, setInMemoryCsrfToken } from "../api";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isDemo: boolean;
  isLoading: boolean;
  error: string | null;
  signInWithGithub: (platform: "ios" | "web") => Promise<void>;
  startDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initAuth = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        // On web, the session is held strictly in the HttpOnly cookie `__Host-mm_session`.
        // JavaScript never stores or reads session tokens in localStorage.
        // We verify the cookie session by requesting the authenticated user profile directly.
        try {
          const me = await api.getMe();
          try {
            const { csrfToken } = await api.getCsrfToken();
            setInMemoryCsrfToken(csrfToken);
          } catch {
            // ignore
          }
          setUser(me);
          setSession({
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          });
          setIsDemo(false);
        } catch {
          setUser(null);
          setSession(null);
          setIsDemo(false);
        }
      } else {
        // Native (iOS/Android): reads session token strictly from SecureStore
        const token = await StorageService.getSessionToken();
        if (token) {
          if (token.includes("demo")) {
            // restore demo session
            const demoRes = await api.startDemoSession();
            setSession(demoRes.session);
            setUser(demoRes.user);
            setIsDemo(true);
          } else {
            // verify real session
            const me = await api.getMe();
            setUser(me);
            setSession({
              token,
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            });
            setIsDemo(false);
          }
        }
      }
    } catch {
      await StorageService.clearSessionToken();
      setUser(null);
      setSession(null);
      setIsDemo(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const signInWithGithub = async (platform: "ios" | "web") => {
    setIsLoading(true);
    setError(null);
    try {
      const { authorizeUrl } = await api.startGithubAuth(platform);
      // In web or iOS: mock completing callback flow
      const res = await api.completeGithubAuth("mock_code", "mock_state", "mock_verifier");
      if (Platform.OS === "web") {
        // Web: session token is in HttpOnly cookie; store CSRF token in memory only
        if (res.session.csrfToken) {
          setInMemoryCsrfToken(res.session.csrfToken);
        }
      } else {
        // Native: session token stored exclusively in SecureStore
        if (res.session.token) {
          await StorageService.setSessionToken(res.session.token);
        }
      }
      setSession(res.session);
      setUser(res.user);
      setIsDemo(false);
    } catch (e: any) {
      setError(e.message || "Failed to sign in with GitHub.");
    } finally {
      setIsLoading(false);
    }
  };

  const startDemo = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.startDemoSession();
      if (Platform.OS === "web") {
        if (res.session.csrfToken) {
          setInMemoryCsrfToken(res.session.csrfToken);
        }
      } else {
        if (res.session.token) {
          await StorageService.setSessionToken(res.session.token);
        }
      }
      setSession(res.session);
      setUser(res.user);
      setIsDemo(true);
    } catch (e: any) {
      setError(e.message || "Failed to start demo session.");
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      await api.logout();
    } catch {
      // ignore
    } finally {
      setInMemoryCsrfToken(null);
      await StorageService.clearSessionToken();
      setUser(null);
      setSession(null);
      setIsDemo(false);
      setIsLoading(false);
    }
  };

  const deleteAccount = async () => {
    setIsLoading(true);
    try {
      await api.deleteAccount();
    } catch {
      // ignore
    } finally {
      setInMemoryCsrfToken(null);
      await StorageService.clearSessionToken();
      setUser(null);
      setSession(null);
      setIsDemo(false);
      setIsLoading(false);
    }
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
        startDemo,
        signOut,
        deleteAccount,
        clearError,
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
