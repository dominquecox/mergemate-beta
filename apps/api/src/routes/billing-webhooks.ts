import { Hono } from "hono";
import type { AppEnv } from "../env";
import { acceptStripeEvent } from "../lib/stripe-events";
export const billingWebhooks=new Hono<AppEnv>().post('/webhooks/stripe',async c=>{
  await acceptStripeEvent(c.env,c.get('deps'),await c.req.text(),c.req.header('stripe-signature'));
  return c.json({received:true});
});
