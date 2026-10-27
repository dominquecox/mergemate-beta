import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { StorageService } from "../storage";
import { api } from "../api";

interface ConsentContextType {
  aiConsentGranted: boolean;
  isLoading: boolean;
  grantConsent: () => Promise<void>;
  revokeConsent: () => Promise<void>;
}

const ConsentContext = createContext<ConsentContextType | null>(null);

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [aiConsentGranted, setAiConsentGranted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkConsent = useCallback(async () => {
    try {
      const localConsent = await StorageService.getAiConsent();
      if (localConsent) {
        setAiConsentGranted(true);
      } else {
        const remote = await api.getConsent();
        setAiConsentGranted(remote.ai.granted);
        if (remote.ai.granted) {
          await StorageService.setAiConsent(true);
        }
      }
    } catch {
      // default false
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkConsent();
  }, [checkConsent]);

  const grantConsent = async () => {
    try {
      await api.setConsent(true);
      await StorageService.setAiConsent(true);
      setAiConsentGranted(true);
    } catch (e) {
      console.error("Failed to grant consent", e);
    }
  };

  const revokeConsent = async () => {
    try {
      await api.setConsent(false);
      await StorageService.setAiConsent(false);
      setAiConsentGranted(false);
    } catch (e) {
      console.error("Failed to revoke consent", e);
    }
  };

  return (
    <ConsentContext.Provider
      value={{
        aiConsentGranted,
        isLoading,
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
