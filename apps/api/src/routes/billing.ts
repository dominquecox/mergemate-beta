import { CheckoutRequest } from "@mergemate/contracts";
import { Hono, type Context } from "hono";
import { requireBinding } from "../config";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";
import { parseBody } from "../lib/validate";
import { billingOperation, ensureCustomer, getBillingPlan } from "../lib/stripe-billing";
import { billingOrigin, billingUrl, expireCheckout, openCheckouts, stripePrice, stripeRequest, subscriptions } from "../lib/stripe";
/** Matches the trial the web app advertises (apps/mobile/src/config/billing.ts). */
export const TRIAL_DAYS = 7;
function realUser(c: Context<AppEnv>, webOnly=false) {
  const session=c.get("session");
  if(session.demo || !session.userId || (webOnly && session.transport!=="cookie")) throw new ApiError("forbidden",webOnly?"Manage billing from a signed-in web session.":"Billing is unavailable in the demo.");
  return session.userId;
}
export const billing = new Hono<AppEnv>()
  .get("/billing/plan",async c=>c.json(await getBillingPlan(c.env,realUser(c))))
  .post("/billing/checkout",async c=>{
    const user=realUser(c,true);const input=await parseBody(c,CheckoutRequest);const deps=c.get("deps");
    const price=stripePrice(c.env,input.priceKey);const origin=billingOrigin(c.env);
    return c.json(await billingOperation(c.env,deps,user,async row=>{
      const customer=await ensureCustomer(c.env,deps,row);
      const existing=await subscriptions(c.env,deps,customer);
      if(existing.some(s=>!["canceled","incomplete_expired"].includes(s.status)))throw new ApiError("forbidden","Manage your existing subscription in the billing portal.");
      // The advertised trial is for a first subscription only; Stripe's own list is the record of earlier ones.
      const trial=existing.length===0?{"subscription_data[trial_period_days]":String(TRIAL_DAYS)}:{};
      for(const session of await openCheckouts(c.env,deps,customer)){
        if(session.metadata?.price_key===input.priceKey && session.url)return billingUrl({url:session.url},"checkout.stripe.com");
        await expireCheckout(c.env,deps,session.id);
      }
      return billingUrl(await stripeRequest(c.env,deps,"POST","/checkout/sessions",{
        customer,mode:"subscription",client_reference_id:user,
        "metadata[user_id]":user,"metadata[price_key]":input.priceKey,"subscription_data[metadata][user_id]":user,...trial,
        "line_items[0][price]":price,"line_items[0][quantity]":"1",
        success_url:`${origin}/billing/success`,cancel_url:`${origin}/billing/cancelled`,
      },`checkout-${crypto.randomUUID()}`),"checkout.stripe.com");
    }));
  })
  .post("/billing/portal",async c=>{
    const user=realUser(c,true);const origin=billingOrigin(c.env);
    const row=await requireBinding(c.env,"DB").prepare('SELECT customer_id,deleting FROM billing_accounts WHERE user_id=?').bind(user).first<{customer_id:string|null;deleting:number}>();
    if(!row?.customer_id || row.deleting)throw new ApiError("not_found","No billing account is available.");
    return c.json(billingUrl(await stripeRequest(c.env,c.get("deps"),"POST","/billing_portal/sessions",{customer:row.customer_id,return_url:`${origin}/billing`},`portal-${crypto.randomUUID()}`),"billing.stripe.com"));
  });
