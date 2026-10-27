import { z } from "zod";
import type { Deps, Env } from "../env";
import { billingReturnOrigins } from "../config";
import { ApiError, ConfigError } from "../errors";
export const STRIPE_API = "https://api.stripe.com/v1";
const version = "2025-06-30.basil";
export const StripeSubscription = z.object({
  id: z.string(), customer: z.string(), livemode: z.literal(false), status: z.string(),
  created: z.number().optional(), cancel_at: z.number().nullable().optional(),
  cancel_at_period_end: z.boolean().optional(),
  items: z.object({ data: z.array(z.object({ current_period_end: z.number().optional(), price: z.object({ id: z.string() }) })) }),
});
export type StripeSubscription = z.infer<typeof StripeSubscription>;
export const StripeCheckout = z.object({
  id: z.string(), url: z.string().nullable(), status: z.string(),
  metadata: z.record(z.string(),z.string()).nullable().optional(),
});
export const stripeMode = (env: Env) => {
  if (env.STRIPE_MODE !== "test" || !env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) throw new ConfigError("Stripe test mode is not configured");
};
export async function stripeRequest(env: Env, deps: Deps, method: string, path: string, params?: Record<string,string>, idempotencyKey?: string): Promise<unknown> {
  stripeMode(env);
  const query = new URLSearchParams(params);
  const url = `${STRIPE_API}${path}${method === "GET" && query.size ? `?${query}` : ""}`;
  let res: Response;
  try {
    res = await deps.fetch(url,{
      method, headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "stripe-version": version, ...(method === "POST" ? {"content-type":"application/x-www-form-urlencoded"} : {}), ...(idempotencyKey ? {"idempotency-key":idempotencyKey} : {}) },
      ...(method === "POST" ? {body:query.toString()} : {}), signal: AbortSignal.timeout(20_000),
    });
  } catch { throw new ApiError("upstream_unavailable","Billing is temporarily unavailable. Try again."); }
  if (!res.ok) throw new ApiError("upstream_unavailable","Billing is temporarily unavailable. Try again.");
  try { return await res.json(); } catch { throw new ApiError("upstream_unavailable","Billing returned an invalid response."); }
}
export function stripePrice(env: Env, key: "pro_monthly" | "pro_annual") {
  const price = key === "pro_monthly" ? env.STRIPE_PRICE_PRO_MONTHLY : env.STRIPE_PRICE_PRO_ANNUAL;
  if (!price || !/^price_[A-Za-z0-9]+$/.test(price)) throw new ConfigError("Stripe price is not configured");
  return price;
}
export function billingOrigin(env: Env) {
  const origin = env.WEB_ORIGIN?.trim() ?? "";
  if (!billingReturnOrigins(env).includes(origin)) throw new ConfigError("Billing return origin is not allowed");
  return origin;
}
const List = z.object({ data: z.array(z.unknown()), has_more: z.boolean() });
export async function stripeList(env: Env, deps: Deps, path: string, customer: string, params: Record<string,string> = {}) {
  const data: unknown[] = []; let cursor: string | undefined;
  for (let page=0; page<10; page++) {
    const value = List.safeParse(await stripeRequest(env,deps,"GET",path,{customer,limit:"100",...params,...(cursor?{starting_after:cursor}:{})}));
    if (!value.success) throw new ApiError("upstream_unavailable","Billing returned an invalid list.");
    data.push(...value.data.data);
    if (!value.data.has_more) return data;
    const last = z.object({id:z.string()}).safeParse(value.data.data.at(-1));
    if (!last.success) throw new ApiError("upstream_unavailable","Billing returned an invalid cursor.");
    cursor=last.data.id;
  }
  throw new ApiError("upstream_unavailable","Billing needs reconciliation before continuing.");
}
export async function subscriptions(env: Env, deps: Deps, customer: string) {
  return (await stripeList(env,deps,"/subscriptions",customer,{status:"all"})).map(value=>{
    const parsed=StripeSubscription.safeParse(value);
    if (!parsed.success || parsed.data.customer!==customer) throw new ApiError("upstream_unavailable","Billing returned an invalid subscription.");
    return parsed.data;
  });
}
export async function openCheckouts(env: Env, deps: Deps, customer: string) {
  return (await stripeList(env,deps,"/checkout/sessions",customer,{status:"open"})).map(value=>{
    const parsed=StripeCheckout.safeParse(value);
    if (!parsed.success) throw new ApiError("upstream_unavailable","Billing returned an invalid checkout.");
    return parsed.data;
  });
}
export function billingUrl(value: unknown, host: "checkout.stripe.com" | "billing.stripe.com") {
  const parsed=z.object({url:z.string()}).safeParse(value);
  if (!parsed.success) throw new ApiError("upstream_unavailable","Billing returned an invalid link.");
  let url: URL;
  try { url=new URL(parsed.data.url); } catch { throw new ApiError("upstream_unavailable","Billing returned an invalid link."); }
  if (!url || url.protocol!=="https:" || url.hostname!==host || url.username || url.password || url.port) throw new ApiError("upstream_unavailable","Billing returned an invalid link.");
  return { url:url.href };
}

export async function expireCheckout(env: Env,deps: Deps,id: string) {
  const response=z.object({id:z.string(),status:z.literal("expired")}).safeParse(await stripeRequest(env,deps,"POST",`/checkout/sessions/${encodeURIComponent(id)}/expire`,{},`expire-${id}`));
  if(!response.success || response.data.id!==id)throw new ApiError("upstream_unavailable","Checkout expiration could not be confirmed.");
}
