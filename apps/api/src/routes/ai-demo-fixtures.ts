import { FIXTURE_ANSWER, FIXTURE_PLAN, FIXTURE_RISK, FIXTURE_SUMMARY } from "./ai-engine-pr-data";
import { prRefString } from "./ai-engine-pr-data";
import type { PrRefParts } from "./ai-engine-pr-data";

const cov = (analyzedFiles: number) => ({ analyzedFiles, skippedFiles: 0, truncatedFiles: 0 });

export interface DemoAi {
  summary: typeof FIXTURE_SUMMARY & {model?:string};
  risk: typeof FIXTURE_RISK;
  plan: typeof FIXTURE_PLAN;
  answer: typeof FIXTURE_ANSWER;
}

const DEFAULT: DemoAi = { summary: FIXTURE_SUMMARY, risk: FIXTURE_RISK, plan: FIXTURE_PLAN, answer: FIXTURE_ANSWER };

/** Pre-written results that match the sample pull requests, so a demo never shows text about a different change. */
const PER_PR: Record<string, DemoAi> = {
  "acme-demo/payments-api#42": {
    summary: {
      whatChanged: "Retries declined-but-retryable card charges with exponential backoff, capped at three attempts, and records each attempt in a new table.",
      whyItMatters: "Fewer customers see a failed payment for a temporary decline, but a retry bug could charge a card twice.",
      suggestedFocus: ["src/charges/retry.ts", "migrations/0007_charge_attempts.sql"],
      coverage: cov(4),
    },
    risk: {
      level: "high",
      reasons: ["Changes how money is charged and adds a database migration.", "The test check is failing.", "The branch has merge conflicts."],
      coverage: cov(4),
      secretFindings: [],
      quality: { needsCloserLook: true, reasons: ["Payment path changed with a failing check."] },
    } as typeof FIXTURE_RISK,
    plan: {
      readingOrder: [
        { file: "src/charges/retry.ts", why: "The new backoff loop; check the cap of three attempts." },
        { file: "src/charges/charge.ts", why: "Where a charge is retried; check a charge cannot run twice at once." },
        { file: "migrations/0007_charge_attempts.sql", why: "Adds the attempts table; check it is safe to apply with no downtime." },
        { file: "src/charges/retry.test.ts", why: "Covers the happy path; the failing test lives here." },
      ],
      verify: [
        "A retry reuses the same idempotency key so the card cannot be charged twice.",
        "Only retryable declines are retried, never a stolen or invalid card.",
        "The migration can be applied before the code ships.",
        "The failing test is fixed, not skipped.",
      ],
      draftComment: "Thanks for the backoff work. Could you confirm each retry reuses the charge's idempotency key, so a retry can never double-charge? The failing test and the merge conflict also need a look before this lands.",
      coverage: cov(4),
      model: "sample:demo",
    },
    answer: {
      answer: "The retry is capped at three attempts with growing delays. Each attempt is recorded in charge_attempts. A reviewer already asked whether it is idempotent per charge id, and the diff does not yet answer that.",
      citations: [{ file: "src/charges/retry.ts" }, { file: "migrations/0007_charge_attempts.sql" }],
      coverage: cov(4),
      model: "sample:demo",
    },
  },
  "acme-demo/storefront#318": {
    summary: {
      whatChanged: "Loads product images only when they scroll into view, using a shared lazy image component.",
      whyItMatters: "Pages load faster, especially on mobile, as long as the layout does not jump when images arrive.",
      suggestedFocus: ["components/Image.tsx", "components/ProductGrid.tsx"],
      coverage: cov(2),
    },
    risk: { ...FIXTURE_RISK, reasons: ["Small front-end change with passing checks."], coverage: cov(2) },
    plan: {
      readingOrder: [
        { file: "components/Image.tsx", why: "The lazy-loading logic lives here." },
        { file: "components/ProductGrid.tsx", why: "Check the first row still loads at once and no layout shift appears." },
      ],
      verify: ["Images above the fold still load immediately.", "Each image reserves its height so the page does not jump."],
      draftComment: "Nice speed-up. Could you check the first row of products loads right away and that images reserve their space? Otherwise this looks good to me.",
      coverage: cov(2),
      model: "sample:demo",
    },
    answer: {
      answer: "Images below the fold now load when they scroll into view. The shared Image component holds the logic and the product grid uses it.",
      citations: [{ file: "components/Image.tsx" }, { file: "components/ProductGrid.tsx" }],
      coverage: cov(2),
      model: "sample:demo",
    },
  },
  "acme-demo/storefront#321": {
    summary: {
      whatChanged: "Updates the checkout SDK from 5.1 to 5.2 and refreshes the lockfile.",
      whyItMatters: "Checkout depends on this SDK, so a breaking change would affect every purchase. The checks are still running.",
      suggestedFocus: ["package.json", "package-lock.json"],
      coverage: cov(2),
    },
    risk: { ...FIXTURE_RISK, level: "medium", reasons: ["Dependency bump on the checkout path.", "Checks have not finished."], coverage: cov(2) } as typeof FIXTURE_RISK,
    plan: {
      readingOrder: [
        { file: "package.json", why: "Confirm only the checkout SDK version changed." },
        { file: "package-lock.json", why: "Skim for unrelated packages pulled in by the bump." },
      ],
      verify: ["The SDK release notes list no breaking changes.", "Checks pass before approving."],
      draftComment: "Thanks for the bump. I will approve once the checks finish and the release notes confirm no breaking changes.",
      coverage: cov(2),
      model: "sample:demo",
    },
    answer: {
      answer: "Only the checkout SDK version and the lockfile changed. Checks are still running, so wait for them before approving.",
      citations: [{ file: "package.json" }],
      coverage: cov(2),
      model: "sample:demo",
    },
  },
};

export const demoAiFor = (ref: PrRefParts): DemoAi => {
 const sample=PER_PR[prRefString(ref)]??DEFAULT;
 return {...sample,summary:{...sample.summary,model:'sample:demo'}};
};
