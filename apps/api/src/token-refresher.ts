import { DurableObject } from "cloudflare:workers";
import type { Env, RefreshOutcome } from "./env";
import { refreshTokens } from "./lib/github-tokens";

/** One instance per user. blockConcurrencyWhile keeps refreshes strictly one at a time. */
export class TokenRefresher extends DurableObject<Env> {
  refresh(userId: string): Promise<RefreshOutcome> {
    return this.ctx.blockConcurrencyWhile(() =>
      refreshTokens(this.env, { fetch: (input, init) => fetch(input, init), now: () => new Date() }, userId),
    );
  }
}
