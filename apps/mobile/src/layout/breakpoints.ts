/**
 * Responsive shell rules for the web build. Pure functions only (no React Native imports) so they can be unit tested.
 * Native iOS never uses these: it always renders the phone layout.
 */

export const BREAKPOINT_TABLET = 768;
export const BREAKPOINT_DESKTOP = 1024;

export type LayoutMode = "phone" | "tablet" | "desktop";
export type ShellKind = "app" | "auth" | "public" | "bare";

export const SIDEBAR_WIDTH = 248;

/** Max width of the content column per layout mode. */
export const COLUMN_WIDTH = {
  phone: 540,
  reading: 720,
  wide: 1100,
  authCard: 520,
} as const;

/** Tab screens that use the full wide column on desktop. Everything else keeps a readable line length. */
const WIDE_TAB_SCREENS = new Set(["inbox", "notifications", "settings"]);

/** Top-level route groups that belong to a signed-in person and get the sidebar on desktop. */
const APP_SEGMENTS = new Set(["(tabs)", "pr", "search", "highlight", "billing", "account"]);

export function getLayoutMode(width: number): LayoutMode {
  if (width >= BREAKPOINT_DESKTOP) return "desktop";
  if (width >= BREAKPOINT_TABLET) return "tablet";
  return "phone";
}

/** Signed-in screens: reaching one without a session (Back after sign-out, a pasted URL) goes to sign-in. */
export function requiresSession(segments: readonly string[]): boolean {
  return getShellKind(segments) === "app";
}

export function getShellKind(segments: readonly string[]): ShellKind {
  const first = segments[0];
  if (first === undefined) return "bare";
  if (APP_SEGMENTS.has(first)) return "app";
  if (first === "(auth)") return "auth";
  if (first === "(public)") return "public";
  return "bare";
}

export interface ShellLayout {
  mode: LayoutMode;
  kind: ShellKind;
  /** Left sidebar nav replaces the bottom tab bar. */
  sidebar: boolean;
  /** Auth screens sit in a centered card on tablet and desktop. */
  card: boolean;
  /** Max width of the content column. undefined means unconstrained (native). */
  columnMaxWidth: number | undefined;
}

export interface ResolveShellInput {
  width: number;
  segments: readonly string[];
  signedIn: boolean;
  isWeb: boolean;
}

export function resolveShell({ width, segments, signedIn, isWeb }: ResolveShellInput): ShellLayout {
  const kind = getShellKind(segments);

  // Native layout must not change: no shell, no column, no sidebar.
  if (!isWeb) {
    return { mode: "phone", kind, sidebar: false, card: false, columnMaxWidth: undefined };
  }

  const mode = getLayoutMode(width);
  if (mode === "phone") {
    return { mode, kind, sidebar: false, card: false, columnMaxWidth: COLUMN_WIDTH.phone };
  }

  const card = kind === "auth";
  const sidebar = mode === "desktop" && kind === "app" && signedIn;

  let columnMaxWidth: number | undefined = COLUMN_WIDTH.reading;
  if (card) {
    columnMaxWidth = COLUMN_WIDTH.authCard;
  } else if (sidebar || (mode === "desktop" && kind === "app")) {
    // Desktop signed-in workspace is fluid next to the sidebar (no artificial gutters).
    columnMaxWidth = undefined;
  }

  return { mode, kind, sidebar, card, columnMaxWidth };
}
