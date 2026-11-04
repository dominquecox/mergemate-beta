import { ApiClientError } from './errors';

/** The parts of a failure that are safe to copy and hand to support: never tokens, cookies or response bodies. */
export interface ErrorDetails {
  code?: string;
  status?: number;
  requestId?: string;
  /** When the failure happened. */
  at?: Date;
}

export function errorDetailsOf(cause: unknown): ErrorDetails | null {
  if (!(cause instanceof ApiClientError)) return null;
  return { at: new Date(), code: cause.code, ...(cause.status ? { status: cause.status } : {}), ...(cause.requestId ? { requestId: cause.requestId } : {}) };
}

/** Anything shaped like a credential is replaced before it can reach the clipboard. */
const SECRET_SHAPES = [
  /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}/g,
];
const clean = (value: string, limit: number) =>
  SECRET_SHAPES.reduce((text, shape) => text.replace(shape, '[redacted]'), value).replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit);
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const safeId = (value: string | undefined) => (value && SAFE_ID.test(value) ? value : undefined);

/** The page without its query or fragment, which can carry one-time codes. */
export function safePageUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? `${url.origin}${url.pathname}` : undefined;
  } catch {
    return undefined;
  }
}

export interface ErrorReport extends Omit<ErrorDetails, 'at'> {
  message: string;
  runId?: string;
  step?: string;
  at: Date;
  pageUrl?: string;
}

/** A short plain-text block for "Copy details". */
export function errorReportText(report: ErrorReport): string {
  const lines: [string, string | undefined][] = [
    ['Error', report.code ? clean(report.code, 64) : undefined],
    ['HTTP status', report.status ? String(report.status) : undefined],
    ['Message', clean(report.message, 600) || undefined],
    ['Request id', safeId(report.requestId)],
    ['Run id', safeId(report.runId)],
    ['Step', report.step ? clean(report.step, 120) : undefined],
    ['Time', Number.isFinite(report.at.getTime()) ? report.at.toISOString() : undefined],
    ['Page', safePageUrl(report.pageUrl)],
  ];
  return ['MergeMate error details', ...lines.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`)].join('\n');
}

/** The current page on web; undefined in the native app. */
export const currentPageUrl = (): string | undefined =>
  typeof window !== 'undefined' && typeof window.location?.href === 'string' ? window.location.href : undefined;
