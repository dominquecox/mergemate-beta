import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { StorageService } from "../storage";
import { api } from "../api";
import { useAuth } from "./AuthContext";
import { AI_CONSENT_VERSION } from "../config/consent";
import { toUserMessage } from "../api/errors";

interface ConsentContextType {
  aiConsentGranted: boolean;
  isLoading: boolean;
  /** Why the last grant or revoke did not go through, in plain words. */
  error: string | null;
  /** Resolve to true when the choice was saved. */
  grantConsent: () => Promise<boolean>;
  revokeConsent: () => Promise<boolean>;
}

const ConsentContext = createContext<ConsentContextType | null>(null);

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const { user, isDemo } = useAuth();
  const userId = user?.id ?? null;
  const [aiConsentGranted, setAiConsentGranted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkConsent = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!userId) {
        setAiConsentGranted(false);
      } else if (isDemo) {
        // The demo shows pre-generated results on sample data, so there is nothing to consent to.
        setAiConsentGranted(true);
      } else if (api.isMock) {
        const localConsent = await StorageService.getAiConsent();
        if (localConsent) {
          setAiConsentGranted(true);
        } else {
          const remote = await api.getConsent();
          setAiConsentGranted(remote.ai.granted);
        }
      } else {
        // The API is the record of consent. A grant for another consent version does not count.
        const remote = await api.getConsent();
        setAiConsentGranted(remote.ai.granted && remote.ai.version === AI_CONSENT_VERSION);
      }
    } catch {
      setAiConsentGranted(false);
    } finally {
      setIsLoading(false);
    }
  }, [userId, isDemo]);

  useEffect(() => {
    checkConsent();
  }, [checkConsent]);

  const update = async (granted: boolean): Promise<boolean> => {
    if (isDemo) return false;
    setError(null);
    try {
      await api.setConsent(granted);
      if (api.isMock) await StorageService.setAiConsent(granted);
      setAiConsentGranted(granted);
      return true;
    } catch (e) {
      // Consent stays as it was.
      setError(toUserMessage(e, "Couldn't save your choice. Try again."));
      return false;
    }
  };

  const grantConsent = () => update(true);
  const revokeConsent = () => update(false);

  return (
    <ConsentContext.Provider
      value={{
        aiConsentGranted,
        isLoading,
        error,
        grantConsent,
        revokeConsent,
      }}
    >
      {children}
    </ConsentContext.Provider>
  );
}

export function useConsent() {
  const context = useContext(ConsentContext);
  if (!context) {
    throw new Error("useConsent must be used within a ConsentProvider");
  }
  return context;
}
