export interface DemoHighlightSample {
  id: string;
  title: string;
  kind: "Build log" | "Screenshot";
  /** What the user would have captured, shown as the preview. Plain text, no real data. */
  excerpt: string;
  insight: string;
  areas: { label: string; comment: string }[];
}

/** Canned results for demo mode. Nothing is uploaded and no model is called. */
export const DEMO_HIGHLIGHT_SAMPLES: readonly DemoHighlightSample[] = [
  {
    id: "build-log-test-failure",
    title: "Failing CI build log",
    kind: "Build log",
    excerpt: "FAIL src/billing/retry.test.ts\n  ✕ retries a failed webhook once (212 ms)\n  Expected: 1 call  Received: 3 calls\nnpm ERR! Test failed. See above for more details.",
    insight: "One test fails: the webhook retry fires three times instead of once, so a customer could be charged or notified repeatedly.",
    areas: [
      { label: "Failing test", comment: "retries a failed webhook once expects 1 call and got 3." },
      { label: "Likely cause", comment: "The retry loop has no stop condition after the first success." },
    ],
  },
  {
    id: "screenshot-settings-toggle",
    title: "Mobile settings regression (Meta SAM Audit)",
    kind: "Screenshot",
    excerpt: "Settings > AI choices (393px mobile viewport)\n[ Screenshot Toggle: 32pt height ]\n[ AI summary toggle: default on without prompt ]",
    insight: "Meta SAM-3.1 segmented 3 interactive regions. Llama Vision flagged an Apple HIG violation: the toggle touch area is 32pt (minimum 44pt), and defaults to on without confirmation.",
    areas: [
      { label: "Tap target violation (<44pt)", comment: "Toggle hit target is 32pt, below Apple touch guidelines." },
      { label: "Unconfirmed AI choice", comment: "Screenshot analysis should start off until explicitly confirmed." },
    ],
  },
  {
    id: "build-log-secret",
    title: "Build log with a leaked key",
    kind: "Build log",
    excerpt: "Using STRIPE_KEY=sk_live_•••••••• from config/stripe.ts\nDeploying worker... done in 4.1s",
    insight: "The log prints a live-looking payment key. Treat it as exposed: rotate it and stop echoing environment values in CI.",
    areas: [
      { label: "Exposed key", comment: "A live payment key appears in plain text on the first line." },
      { label: "Where it came from", comment: "config/stripe.ts reads the key directly instead of from a Worker secret." },
    ],
  },
];
