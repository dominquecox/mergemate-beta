import { z } from "zod";
import { requireBinding } from "../config";
import type { Deps, Env } from "../env";
import { ApiError, ConfigError } from "../errors";
import { billingOperation } from "./stripe-billing";
import { stripePrice, subscriptions } from "./stripe";
const types=new Set(["checkout.session.completed","customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.payment_failed","invoice.paid"]);
const Event=z.object({id:z.string().min(1).max(255),type:z.string(),created:z.number().int(),livemode:z.literal(false),data:z.object({object:z.object({customer:z.union([z.string(),z.object({id:z.string()})]).nullable().optional()}).passthrough()})});
export async function verifyStripeEvent(raw: string, header: string|undefined, env: Env, now: Date) {
  if(env.STRIPE_MODE!=="test" || !env.STRIPE_WEBHOOK_SECRET)throw new ConfigError("Stripe test webhook is not configured");
  const parts=(header??"").split(',');const times=parts.filter(p=>p.startsWith('t='));const timestamp=times.length===1?Number(times[0]?.slice(2)):NaN;
  if(!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(now.getTime()/1000)-timestamp)>300)throw new ApiError("forbidden","Invalid webhook signature.");
  const signatures=parts.filter(p=>p.startsWith('v1=')).map(p=>p.slice(3)).filter(s=>/^[a-f0-9]{64}$/i.test(s));
  const encoder=new TextEncoder();const key=await crypto.subtle.importKey("raw",encoder.encode(env.STRIPE_WEBHOOK_SECRET),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  let valid=false;
  for(const hex of signatures){const signature=Uint8Array.from(hex.match(/../g)??[],pair=>parseInt(pair,16));if(await crypto.subtle.verify("HMAC",key,signature,encoder.encode(`${timestamp}.${raw}`)))valid=true;}
  if(!valid)throw new ApiError("forbidden","Invalid webhook signature.");
  let json:unknown;try{json=JSON.parse(raw);}catch{throw new ApiError("validation_failed","Invalid webhook body.");}
  const event=Event.safeParse(json);if(!event.success)throw new ApiError("validation_failed","Invalid test webhook event.");
  return event.data;
}
export async function acceptStripeEvent(env: Env,deps: Deps,raw:string,signature:string|undefined) {
  const event=await verifyStripeEvent(raw,signature,env,deps.now());
  if(!types.has(event.type))return;
  const customer=typeof event.data.object.customer==='string'?event.data.object.customer:event.data.object.customer?.id;
  if(!customer || !/^cus_[A-Za-z0-9]+$/.test(customer))throw new ApiError("validation_failed","Webhook customer is missing.");
  if(!env.STRIPE_EVENTS)throw new ConfigError("Stripe event queue is not configured");
  const db=requireBinding(env,"DB");
  await db.prepare('INSERT INTO stripe_events(event_id,event_type,customer_id,received_at) VALUES(?,?,?,?) ON CONFLICT(event_id) DO NOTHING').bind(event.id,event.type,customer,deps.now().toISOString()).run();
  const row=await db.prepare('SELECT status FROM stripe_events WHERE event_id=?').bind(event.id).first<{status:string}>();
  if(row?.status==='done')return;
  // If queue send fails, keep the durable pending row and let Stripe retry this delivery.
  try{await env.STRIPE_EVENTS.send({eventId:event.id});}catch{throw new ApiError("upstream_unavailable","Webhook delivery could not be queued.");}
}
export async function processStripeEvent(env: Env,deps: Deps,eventId:string) {
  const db=requireBinding(env,"DB");
  const event=await db.prepare('SELECT customer_id,status FROM stripe_events WHERE event_id=?').bind(eventId).first<{customer_id:string;status:string}>();
  if(!event || event.status==='done')return;
  const account=await db.prepare('SELECT user_id,deleting FROM billing_accounts WHERE customer_id=?').bind(event.customer_id).first<{user_id:string;deleting:number}>();
  if(!account || account.deleting){await db.prepare("UPDATE stripe_events SET status='done',completed_at=? WHERE event_id=?").bind(deps.now().toISOString(),eventId).run();return;}
  await billingOperation(env,deps,account.user_id,async row=>{
    const state=await db.prepare('SELECT status FROM stripe_events WHERE event_id=?').bind(eventId).first<{status:string}>();
    if(state?.status==='done')return;
    const prices=[stripePrice(env,'pro_monthly'),stripePrice(env,'pro_annual')];
    // Fetch canonical state rather than trusting delivery order or stale event snapshots.
    const all=await subscriptions(env,deps,event.customer_id);
    const entitled=all.filter(s=>['active','trialing'].includes(s.status)&&s.items.data.some(item=>prices.includes(item.price.id))).sort((a,b)=>(b.created??0)-(a.created??0));
    const current=entitled[0];
    const end=current?.items.data.reduce((min,item)=>Math.min(min,item.current_period_end??Infinity),Infinity);
    const renewal=end&&Number.isFinite(end)?new Date(end*1000).toISOString():null;
    const cancel=current?.cancel_at?new Date(current.cancel_at*1000).toISOString():current?.cancel_at_period_end?renewal:null;
    await db.batch([
      db.prepare('UPDATE billing_accounts SET plan=?,status=?,subscription_id=?,renews_at=?,cancel_at=?,updated_at=? WHERE user_id=? AND deleting=0')
        .bind(current?'pro':'free',current?.status??all[0]?.status??'none',current?.id??null,cancel?null:renewal,cancel,deps.now().toISOString(),row.user_id),
      db.prepare("UPDATE stripe_events SET status='done',completed_at=? WHERE event_id=?").bind(deps.now().toISOString(),eventId),
    ]);
  });
}
export async function consumeStripeEvents(batch: MessageBatch<{eventId:string}>,env:Env,deps:Deps) {
  for(const message of batch.messages){
    if(typeof message.body?.eventId!=='string' || !/^evt_[A-Za-z0-9_]{1,251}$/.test(message.body.eventId)){
      await requireBinding(env,"DB").prepare("INSERT INTO webhook_dead_letters(source,event,failed_at) VALUES('stripe','invalid_message',?)").bind(deps.now().toISOString()).run();
      message.ack();continue;
    }
    try{await processStripeEvent(env,deps,message.body.eventId);message.ack();}
    catch{await requireBinding(env,"DB").prepare('UPDATE stripe_events SET attempts=attempts+1 WHERE event_id=?').bind(message.body.eventId).run();message.retry({delaySeconds:Math.min(300,10*2**Math.min(5,Math.max(0,(message.attempts??1)-1)))});}
  }
}
