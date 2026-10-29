import {ApiError} from '../errors';

export const deletionPending=async(db:D1Database,userId:string)=>Boolean(await db.prepare("SELECT 1 AS present FROM account_deletions WHERE user_id=? AND state='pending'").bind(userId).first());

/** One owner at a time. A killed request can be retried after its bounded lease expires. */
export async function claimDeletion(db:D1Database,userId:string,now:Date){
  const token=crypto.randomUUID();
  await db.prepare("INSERT INTO account_deletions(user_id,started_at) SELECT id,? FROM users WHERE id=? ON CONFLICT(user_id) DO NOTHING").bind(now.toISOString(),userId).run();
  const claim=await db.prepare("UPDATE account_deletions SET lease_token=?,lease_until=? WHERE user_id=? AND state='pending' AND (lease_token IS NULL OR lease_until<=?)")
    .bind(token,new Date(now.getTime()+10*60_000).toISOString(),userId,now.toISOString()).run();
  if(claim.meta.changes!==1)throw new ApiError('rate_limited','Account deletion is already in progress. Try again.',{'retry-after':'2'});
  return token;
}

export async function releaseDeletion(db:D1Database,userId:string,token:string){
  await db.prepare('UPDATE account_deletions SET lease_token=NULL,lease_until=NULL WHERE user_id=? AND lease_token=?').bind(userId,token).run();
}

/** Minimal random user-id tombstones outlive bounded in-flight work; no grant hash remains. */
export const purgeDeletionTombstones=(db:D1Database,now:Date)=>db.prepare("DELETE FROM account_deletions WHERE state='completed' AND completed_at<=?").bind(new Date(now.getTime()-7*24*60*60_000).toISOString()).run();
