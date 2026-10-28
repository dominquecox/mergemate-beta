import type { PrRisk, PrSummary } from "@mergemate/contracts";
import type { PrDetail } from "../types";
import { ApiClientError, messageForCode } from "./errors";
import { secretWarningFromRisk } from "./mappers";

/** Failures a person can fix by trying again. Quota, consent, the AI setting and setup problems are not among them. */
const RETRYABLE = new Set<string>(["upstream_unavailable", "timeout", "network", "internal", "rate_limit_unavailable", "parse_failed"]);

/** What the AI notice offers: try again, open Settings (consent or AI turned off), or nothing (limit, setup). */
export function aiNoticeAction(code: string | undefined): "retry" | "settings" | null {
  if (!code) return null;
  if (RETRYABLE.has(code)) return "retry";
  if (code === "consent_required" || code === "forbidden") return "settings";
  return null;
}

const noticeFor = (reason: unknown): { code: string; message: string } =>
  reason instanceof ApiClientError
    ? { code: reason.code, message: reason.message }
    : { code: "internal", message: messageForCode("internal") };

/**
 * Applies a retry of the missing AI parts to the PR on screen. Parts that already loaded are kept; the notice is
 * cleared only when nothing is missing any more.
 */
export function applyAiRetry(
  prev: PrDetail,
  summary: PromiseSettledResult<PrSummary> | null,
  risk: PromiseSettledResult<PrRisk> | null,
): PrDetail {
  const next: PrDetail = { ...prev };
  if (summary?.status === "fulfilled") next.summary = summary.value;
  if (risk?.status === "fulfilled") {
    next.risk = risk.value;
    next.secretWarning = secretWarningFromRisk(risk.value);
  }
  const failure = [summary, risk].find((r): r is PromiseRejectedResult => r?.status === "rejected");
  if (failure) next.aiNotice = noticeFor(failure.reason);
  else delete next.aiNotice;
  return next;
}
