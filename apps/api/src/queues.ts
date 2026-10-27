import type { Deps, Env } from "./env";
import { consumeGitHubEvents, type GitHubEventMessage, recordDeadLetters } from "./lib/github-webhooks";
import { consumeStripeEvents } from "./lib/stripe-events";

/**
 * Routes each queue batch to its consumer by queue name. Queue names per environment are
 * set in wrangler.toml; other queue consumers are added here.
 */
export const handleQueue = async (batch: MessageBatch<unknown>, env: Env, now = new Date(), deps: Deps = { fetch, now: () => new Date() }) => {
  const name = batch.queue;
  if (/^mergemate-github-events(-[a-z]+)?-dlq$/.test(name)) {
    return recordDeadLetters(batch as MessageBatch<Partial<GitHubEventMessage>>, env, "github", now);
  }
  if (/^mergemate-github-events(-[a-z]+)?$/.test(name)) {
    return consumeGitHubEvents(batch as MessageBatch<GitHubEventMessage>, env, now, deps);
  }
  if (/^mergemate-stripe-events(-[a-z]+)?$/.test(name)) {
    return consumeStripeEvents(batch as MessageBatch<{ eventId: string }>, env, {
      fetch: (input, init) => fetch(input, init),
      now: () => new Date(),
    });
  }
  // Unknown queue: leave the messages for retry rather than dropping them.
  batch.retryAll();
};
