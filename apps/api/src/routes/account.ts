import { Hono } from "hono";
import { requireBinding, requireVar } from "../config";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";
import { GITHUB_API } from "../lib/github";
import { cancelBillingBeforeDelete } from "../lib/stripe-billing";
import { getDeletionTokenSnapshot } from "../lib/github-tokens";
import { clearedSessionCookie } from "../lib/sessions";
import {sha256Hex} from "../lib/crypto";
import {claimDeletion,releaseDeletion} from "../lib/account-deletion";
import { deleteUserUploads } from "./highlight";

/**
 * Revokes the user's grant for this GitHub App (an app-level call authenticated with the
 * client credentials, not a write to any repository). Only a confirmed204 is success; an ambiguous response must be retried or reauthorized.
 */
const revokeGrant = async (
  fetcher: typeof fetch,
  clientId: string,
  clientSecret: string,
  accessToken: string,
) => {
  let res: Response;
  try {
    res = await fetcher(`${GITHUB_API}/applications/${encodeURIComponent(clientId)}/grant`, {
      method: "DELETE",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "content-type": "application/json",
        "user-agent": "MergeMate",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ access_token: accessToken }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ApiError("upstream_unavailable", "Could not reach GitHub to revoke access. Try again.");
  }
  if (res.status === 204) return;
  throw new ApiError("upstream_unavailable", "Could not revoke GitHub access. Try again.");
};

export const account = new Hono<AppEnv>().delete("/account", async (c) => {
  const session = c.get("session");
  const userId = session.userId;
  if (!userId) throw new ApiError("forbidden", "Not available in the demo.");
  const db = requireBinding(c.env, "DB");
  const deps = c.get("deps");

  const lease=await claimDeletion(db,userId,deps.now());
  // External work is bounded below the ten-minute lease; every final write is fenced too.
  const deadline=Date.now()+55_000;
  const boundedFetch:typeof fetch=(input,init)=>{
    const remaining=deadline-Date.now();if(remaining<=0)return Promise.reject(new Error("Deletion request deadline"));
    const timeout=AbortSignal.timeout(remaining);
    return deps.fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,timeout]):timeout});
  };
  try {
    await cancelBillingBeforeDelete(c.env,{...deps,fetch:boundedFetch},userId,lease);
    const progress=await db.prepare('SELECT grant_token_hash FROM account_deletions WHERE user_id=? AND lease_token=?').bind(userId,lease).first<{grant_token_hash:string|null}>();
    if(!progress)throw new ApiError("rate_limited","Another deletion attempt took over. Try again.",{"retry-after":"2"});
    let snapshot=await db.prepare('SELECT access_token FROM github_tokens WHERE user_id=?').bind(userId).first<{access_token:string}>();
    const confirmed=Boolean(progress.grant_token_hash && (!snapshot || await sha256Hex(snapshot.access_token)===progress.grant_token_hash));
    if(!confirmed){
      let grant:Awaited<ReturnType<typeof getDeletionTokenSnapshot>>;
      try{grant=await getDeletionTokenSnapshot(c.env,userId,deps.now());}
      catch(error){if(error instanceof ApiError && error.code==='unauthorized')throw new ApiError('upstream_unavailable','Sign in with GitHub again to finish account deletion.');throw error;}
      await revokeGrant(boundedFetch,requireVar(c.env,"GITHUB_APP_CLIENT_ID"),requireVar(c.env,"GITHUB_APP_CLIENT_SECRET"),grant.token);
      const saved=await db.prepare('UPDATE account_deletions SET grant_token_hash=? WHERE user_id=? AND lease_token=?')
        .bind(await sha256Hex(grant.encryptedAccess),userId,lease).run();
      if(saved.meta.changes!==1)throw new ApiError('rate_limited','Another deletion attempt took over. Try again.',{'retry-after':'2'});
      snapshot={access_token:grant.encryptedAccess};
    }
    await deleteUserUploads(c.env,userId);
    // A new OAuth grant during cleanup must be revoked by a new retry, never silently deleted.
    const guard=`EXISTS(SELECT 1 FROM account_deletions WHERE user_id=?1 AND lease_token=?2 AND state='pending')
      AND ((?3 IS NULL AND NOT EXISTS(SELECT 1 FROM github_tokens WHERE user_id=?1)) OR EXISTS(SELECT 1 FROM github_tokens WHERE user_id=?1 AND access_token=?3))`;
    const captured=snapshot?.access_token??null;
    const result=await db.batch([
      db.prepare(`DELETE FROM ai_usage_daily WHERE scope IN (?1,?1||':triage',?1||':metakey') AND ${guard}`).bind(userId,lease,captured),
      // Foreign keys atomically cascade all user-owned tables, including BYOK and spent sessions.
      db.prepare(`DELETE FROM users WHERE id=?1 AND ${guard}`).bind(userId,lease,captured),
      db.prepare("UPDATE account_deletions SET state='completed',completed_at=?,grant_token_hash=NULL,billing_owner_token=NULL,lease_token=NULL,lease_until=NULL WHERE user_id=? AND lease_token=? AND NOT EXISTS(SELECT 1 FROM users WHERE id=?)")
        .bind(deps.now().toISOString(),userId,lease,userId),
    ]);
    if(result[1]?.meta.changes!==1)throw new ApiError('upstream_unavailable','Account access changed during deletion. Try again to finish.');
    if(session.transport==='cookie')c.header('set-cookie',clearedSessionCookie());
    return c.body(null,204);
  } finally {await releaseDeletion(db,userId,lease);}
});
