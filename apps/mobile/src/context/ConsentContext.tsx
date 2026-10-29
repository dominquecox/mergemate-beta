import React, { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { api } from "../api";
import { useAuth } from "./AuthContext";
import { AiChoices, isAiConsentCurrent, needsConsentReview, type AiChoicePending } from "../consent/aiChoices";

interface ConsentContextType {
  /** True only when this account agreed to the consent text this build shows. */
  aiConsentGranted: boolean;
  /** The person agreed to an older consent text and has to read and agree again. */
  needsReview: boolean;
  /** The separate "AI summaries and risk" preference. Meaningful only while consent is granted. */
  aiSummaries: boolean;
  isLoading: boolean;
  /** The change being saved right now. */
  pending: AiChoicePending | null;
  /** Why the last read or change did not go through, in plain words. */
  error: string | null;
  /** Resolve to true only when the server confirmed the choice. */
  grantConsent: () => Promise<boolean>;
  revokeConsent: () => Promise<boolean>;
  setAiSummaries: (enabled: boolean) => Promise<boolean>;
  refreshConsent: () => Promise<boolean>;
}

const ConsentContext = createContext<ConsentContextType | null>(null);

const DEMO_MESSAGE = "The sample-data demo shows saved examples, so there is nothing to change here.";

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const { user, isDemo } = useAuth();
  const userId = user?.id ?? null;
  // One controller per account: a different account never sees, or receives answers meant for, the last one.
  const choices = useMemo(() => new AiChoices(api), [userId, isDemo]);
  const live = userId !== null && !isDemo;
  const state = useSyncExternalStore(choices.subscribe, choices.getState, choices.getState);

  useEffect(() => {
    if (live) void choices.refresh();
    return () => choices.reset();
  }, [choices, live]);

  // Another tab or device may have changed the choices: read them again whenever the app comes to the foreground.
  useEffect(() => {
    if (!live) return;
    const foreground = () => void choices.refresh();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") foreground();
    });
    const visible = () => {
      if (document.visibilityState === "visible") foreground();
    };
    const web = Platform.OS === "web" && typeof document !== "undefined";
    if (web) {
      document.addEventListener("visibilitychange", visible);
      window.addEventListener("focus", foreground);
    }
    return () => {
      sub.remove();
      if (web) {
        document.removeEventListener("visibilitychange", visible);
        window.removeEventListener("focus", foreground);
      }
    };
  }, [choices, live]);

  const grantConsent = useCallback(async () => (live ? choices.grant() : false), [choices, live]);
  const revokeConsent = useCallback(async () => (live ? choices.revoke() : false), [choices, live]);
  const setAiSummaries = useCallback(async (enabled: boolean) => (live ? choices.setSummaries(enabled) : false), [choices, live]);
  const refreshConsent = useCallback(async () => (live ? choices.refresh() : false), [choices, live]);

  const value: ConsentContextType = {
    // The demo shows pre-generated results on sample data, so there is nothing to consent to.
    aiConsentGranted: isDemo && userId !== null ? true : live && isAiConsentCurrent(state.prefs),
    needsReview: live && needsConsentReview(state.prefs),
    aiSummaries: isDemo ? true : live && (state.prefs?.aiSummaries ?? false),
    isLoading: live && state.loading,
    pending: state.pending,
    error: isDemo && userId !== null ? null : state.error,
    grantConsent,
    revokeConsent,
    setAiSummaries,
    refreshConsent,
  };

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export { DEMO_MESSAGE };

export function useConsent() {
  const context = useContext(ConsentContext);
  if (!context) {
    throw new Error("useConsent must be used within a ConsentProvider");
  }
  return context;
}
