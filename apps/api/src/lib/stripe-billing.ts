import type { BillingPlan } from "@mergemate/contracts";
import { z } from "zod";
import { requireBinding } from "../config";
import type { Deps, Env } from "../env";
import { ApiError } from "../errors";
import { expireCheckout, openCheckouts, stripeRequest, subscriptions } from "./stripe";
export type BillingAccount = { user_id:string; customer_id:string|null; plan:"free"|"pro"; status:string; subscription_id:string|null; renews_at:string|null; cancel_at:string|null; deleting:number };
export async function getBillingPlan(env: Env, userId: string): Promise<BillingPlan> {
  const row=await requireBinding(env,"DB").prepare('SELECT plan,status,renews_at,cancel_at,customer_id,subscription_id,deleting FROM billing_accounts WHERE user_id=?').bind(userId).first<BillingAccount>();
  const status=row?.status??"none";
  // "none" means no subscription has ever been recorded for this account (webhooks keep the last status otherwise).
  const subscribedBefore=status!=="none" || Boolean(row?.subscription_id);
  return {
    plan:row?.plan??"free",status,renewsAt:row?.renews_at??null,cancelAt:row?.cancel_at??null,
    trialEligible:!subscribedBefore,
    canManage:Boolean(row?.customer_id) && !row?.deleting && subscribedBefore,
  };
}
export async function billingOperation<T>(env: Env,deps: Deps,userId: string,run:(row:BillingAccount)=>Promise<T>,deleting=false): Promise<T> {
  const db=requireBinding(env,"DB");const token=crypto.randomUUID();
  await db.prepare("INSERT INTO billing_accounts(user_id,updated_at) SELECT id,? FROM users WHERE id=? ON CONFLICT(user_id) DO NOTHING").bind(deps.now().toISOString(),userId).run();
  const acquired=await db.prepare(`UPDATE billing_accounts SET operation_token=?,deleting=CASE WHEN ? THEN 1 ELSE deleting END WHERE user_id=? AND operation_token IS NULL${deleting?"":" AND deleting=0"}`).bind(token,deleting?1:0,userId).run();
  if (acquired.meta.changes!==1) throw new ApiError("rate_limited","Another billing operation is in progress. Try again.",{"retry-after":"2"});
  try {
    const row=await db.prepare('SELECT * FROM billing_accounts WHERE user_id=?').bind(userId).first<BillingAccount>();
    if(!row)throw new ApiError("not_found","Account not found.");
    return await run(row);
  } finally { await db.prepare('UPDATE billing_accounts SET operation_token=NULL WHERE user_id=? AND operation_token=?').bind(userId,token).run(); }
}
export async function ensureCustomer(env: Env,deps: Deps,row: BillingAccount) {
  if(row.customer_id)return row.customer_id;
  const value=z.object({id:z.string().regex(/^cus_[A-Za-z0-9]+$/),livemode:z.literal(false)}).safeParse(await stripeRequest(env,deps,"POST","/customers",{"metadata[user_id]":row.user_id},`customer-${row.user_id}`));
  if(!value.success)throw new ApiError("upstream_unavailable","Billing returned an invalid customer.");
  await requireBinding(env,"DB").prepare('UPDATE billing_accounts SET customer_id=?,updated_at=? WHERE user_id=?').bind(value.data.id,deps.now().toISOString(),row.user_id).run();
  return value.data.id;
}
export async function cancelBillingBeforeDelete(env: Env,deps: Deps,userId: string) {
  await billingOperation(env,deps,userId,async account=>{
    if(!account.customer_id)return;
    for(const session of await openCheckouts(env,deps,account.customer_id))await expireCheckout(env,deps,session.id);
    for(const sub of await subscriptions(env,deps,account.customer_id)) {
      if(["canceled","incomplete_expired"].includes(sub.status))continue;
      const value=z.object({id:z.string(),status:z.literal("canceled")}).safeParse(await stripeRequest(env,deps,"DELETE",`/subscriptions/${encodeURIComponent(sub.id)}`));
      if(!value.success || value.data.id!==sub.id)throw new ApiError("upstream_unavailable","Subscription cancellation could not be confirmed.");
    }
  },true);
}
