import { z } from "zod";

/**
 * Response shapes the API returns that packages/contracts does not export.
 * Kept next to the client so a parse failure is an error state, never raw data.
 */

/** PUT /v1/repos/{id}/watch echoes the repo without `private`. */
export const RepoWatchResponse = z.object({
  id: z.string(),
  fullName: z.string(),
  watching: z.boolean(),
});

/** POST /v1/public/support answers 202 with this. */
export const SupportReceived = z.object({ received: z.literal(true) });
