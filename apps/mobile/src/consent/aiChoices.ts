import type { AiPreferenceUpdate, AiPreferences } from "@mergemate/contracts";
import { AI_CONSENT_VERSION } from "../config/consent";
import { ApiClientError, toUserMessage } from "../api/errors";

export type AiChoicePending = "grant" | "revoke" | "summaries";

export interface AiChoicesState {
  /** True until the first read of this account's choices finishes. */
  loading: boolean;
  /** The server's last answer. Null until one arrives, and after the account changes. */
  prefs: AiPreferences | null;
  /** The change being saved right now, if any. Nothing is shown as saved until the server confirms it. */
  pending: AiChoicePending | null;
  /** Why the last read or change did not go through, in plain words. */
  error: string | null;
}

export interface AiChoicesApi {
  getAiPreferences(): Promise<AiPreferences>;
  updateAiPreferences(update: AiPreferenceUpdate): Promise<AiPreferences>;
}

export const EMPTY_AI_CHOICES: AiChoicesState = { loading: true, prefs: null, pending: null, error: null };

/** AI processing counts only when the account agreed to the consent text this build shows. */
export const isAiConsentCurrent = (prefs: AiPreferences | null): boolean =>
  !!prefs && prefs.ai.granted && prefs.ai.version === AI_CONSENT_VERSION;

/** The person agreed to an older text: they must read and agree again. */
export const needsConsentReview = (prefs: AiPreferences | null): boolean =>
  !!prefs && prefs.ai.granted && prefs.ai.version !== AI_CONSENT_VERSION;

/**
 * The account's AI choices as the server holds them. The screen shows only what the server last confirmed:
 * a failed change leaves the previous state and an error, and an answer that arrives after the account changed
 * or the controller was reset is dropped.
 */
export class AiChoices {
  private state: AiChoicesState = EMPTY_AI_CHOICES;
  private listeners = new Set<() => void>();
  private generation = 0;
  private busy = false;
  /** Bumped when a write starts and when it finishes: a read begun before either describes a state that may be gone. */
  private epoch = 0;
  private readSeq = 0;
  private appliedSeq = 0;

  constructor(private readonly api: AiChoicesApi) {}

  getState = (): AiChoicesState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(next: Partial<AiChoicesState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of [...this.listeners]) listener();
  }

  /** Forget everything and ignore answers to requests already sent: used on sign-out and account switch. */
  reset(): void {
    this.generation += 1;
    this.epoch += 1;
    this.busy = false;
    this.state = EMPTY_AI_CHOICES;
    for (const listener of [...this.listeners]) listener();
  }

  /**
   * Reads the canonical choices. A failed refresh keeps what was last confirmed and says so. A read that follows a
   * failed change passes keepMessage so the reason for that failure stays on screen.
   */
  async refresh(keepMessage = false): Promise<boolean> {
    const generation = this.generation;
    const epoch = this.epoch;
    const seq = ++this.readSeq;
    // A read is current only if no write started or finished since it began and no newer read already landed.
    const stale = () => generation !== this.generation || epoch !== this.epoch || seq < this.appliedSeq || this.busy;
    try {
      const prefs = await this.api.getAiPreferences();
      if (generation !== this.generation) return false;
      if (stale()) return true;
      this.appliedSeq = seq;
      this.set({ loading: false, prefs, ...(keepMessage ? {} : { error: null }) });
      return true;
    } catch (e) {
      if (generation !== this.generation) return false;
      if (stale()) return false;
      this.set({ loading: false, error: toUserMessage(e, "Couldn't load your AI choices. Try again.") });
      return false;
    }
  }

  private async change(kind: AiChoicePending, update: AiPreferenceUpdate): Promise<boolean> {
    if (this.busy) return false;
    const generation = this.generation;
    this.busy = true;
    this.epoch += 1;
    this.set({ pending: kind, error: null });
    try {
      const prefs = await this.api.updateAiPreferences(update);
      if (generation !== this.generation) return false;
      this.busy = false;
      this.epoch += 1;
      this.set({ pending: null, prefs, error: null });
      return true;
    } catch (e) {
      if (generation !== this.generation) return false;
      this.busy = false;
      this.epoch += 1;
      this.set({ pending: null, error: toUserMessage(e, "Couldn't save your choice. Try again.") });
      // The choices changed somewhere else: show the server's state, keep the message.
      if (e instanceof ApiClientError && e.code === "consent_changed") await this.refresh(true);
      return false;
    }
  }

  private revision(): string | null {
    return this.state.prefs?.revision ?? null;
  }

  /** Agree to the consent text this build shows. Needs the server's current choices first. */
  async grant(): Promise<boolean> {
    const expectedRevision = this.revision();
    if (!expectedRevision) {
      this.set({ error: "Your AI choices aren't loaded yet. Try again in a moment." });
      void this.refresh(true);
      return false;
    }
    return this.change("grant", { action: "grant", version: AI_CONSENT_VERSION, expectedRevision });
  }

  /** Withdraw consent. Needs no revision: a revoke must always go through. */
  revoke(): Promise<boolean> {
    return this.change("revoke", { action: "revoke" });
  }

  async setSummaries(enabled: boolean): Promise<boolean> {
    const expectedRevision = this.revision();
    if (!expectedRevision) {
      this.set({ error: "Your AI choices aren't loaded yet. Try again in a moment." });
      void this.refresh(true);
      return false;
    }
    return this.change("summaries", { action: "summaries", enabled, expectedRevision });
  }
}
