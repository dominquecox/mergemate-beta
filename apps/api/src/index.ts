import { createApp } from "./app";
import { consumeStripeEvents } from "./lib/stripe-events";
import type { Env } from "./env";

export { TokenRefresher } from "./token-refresher";

const app=createApp();
export default {
  fetch: app.fetch,
  queue: (batch: MessageBatch<{eventId:string}>,env:Env) => consumeStripeEvents(batch,env,{fetch:(input,init)=>fetch(input,init),now:()=>new Date()}),
};
