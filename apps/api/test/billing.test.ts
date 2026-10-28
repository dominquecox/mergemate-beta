import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSession } from "../src/lib/sessions";
import { acceptStripeEvent, processStripeEvent, verifyStripeEvent } from "../src/lib/stripe-events";
import { getBillingPlan } from "../src/lib/stripe-billing";
import { json, testContext, type TestContext } from "./helpers";
import { appFor, post, signIn } from "./sign-in";
const origin="http://localhost:8081";
const customer="cus_testbilling";
const subscription=(status="active")=>({id:"sub_testbilling",customer,livemode:false,status,created:1,items:{data:[{price:{id:"price_monthly"},current_period_end:1800000000}]},cancel_at_period_end:false});
function setup(){
  const ctx=testContext({STRIPE_MODE:"test",STRIPE_SECRET_KEY:["sk","test","placeholder"].join('_'),STRIPE_WEBHOOK_SECRET:"webhook-placeholder-not-real",STRIPE_PRICE_PRO_MONTHLY:"price_monthly",STRIPE_PRICE_PRO_ANNUAL:"price_annual"});
  const messages:{eventId:string}[]=[];
  ctx.env.STRIPE_EVENTS={send:async(body:{eventId:string})=>{messages.push(body);return {metadata:{metrics:{backlogCount:messages.length,backlogBytes:0}}};}};
  ctx.net.on("POST","https://api.stripe.com/v1/customers",{id:customer,livemode:false})
    .on("GET","https://api.stripe.com/v1/subscriptions",{data:[],has_more:false})
    .on("GET","https://api.stripe.com/v1/checkout/sessions",{data:[],has_more:false})
    .on("POST","https://api.stripe.com/v1/checkout/sessions",{url:"https://checkout.stripe.com/c/pay/test"})
    .on("POST","https://api.stripe.com/v1/billing_portal/sessions",{url:"https://billing.stripe.com/p/session/test"});
  return {ctx,messages};
}
async function web(ctx:TestContext){const s=await signIn(ctx,"web");return {...s,headers:{...s.headers,origin,"x-csrf-token":s.csrf??""}};}
function event(ctx:TestContext,id="evt_test",type="customer.subscription.updated",t=Math.floor(ctx.time.now().getTime()/1000)){
  const raw=JSON.stringify({id,type,created:t,livemode:false,data:{object:{customer}}});
  const sig=createHmac('sha256',ctx.env.STRIPE_WEBHOOK_SECRET??'').update(`${t}.${raw}`).digest('hex');return {raw,signature:`t=${t},v1=${sig}`};
}
async function mapped(ctx:TestContext,user:string){await ctx.db.prepare('INSERT INTO billing_accounts(user_id,customer_id,updated_at) VALUES(?,?,?)').bind(user,customer,ctx.time.now().toISOString()).run();}
describe('billing sessions',()=>{
  it('permits plan reads on native but rejects native checkout and demo billing',async()=>{
    const {ctx}=setup();const native=await signIn(ctx);const app=appFor(ctx);
    expect((await app('/v1/billing/plan',{headers:native.headers})).status).toBe(200);
    expect((await app('/v1/billing/checkout',post({priceKey:'pro_monthly'},native.headers))).status).toBe(403);
    expect((await app('/v1/billing/plan')).status).toBe(401);
    const demo=await createSession(ctx.env.DB,{userId:null,transport:'bearer',now:ctx.time.now()});
    expect((await app('/v1/billing/plan',{headers:{authorization:`Bearer ${demo.token}`}})).status).toBe(403);
  });
  it('requires CSRF, fixed prices and no client redirect URLs',async()=>{
    const {ctx}=setup();const s=await web(ctx);const app=appFor(ctx);
    expect((await app('/v1/billing/checkout',post({priceKey:'pro_monthly'},s.body.session.csrfToken?{...s.headers,'x-csrf-token':''}:{}))).status).toBe(403);
    expect((await app('/v1/billing/checkout',post({priceKey:'price_attacker'},s.headers))).status).toBe(422);
    expect((await app('/v1/billing/checkout',post({priceKey:'pro_monthly',success_url:'https://evil.example'},s.headers))).status).toBe(422);
    expect(ctx.net.calls.filter(c=>c.url.startsWith('https://api.stripe.com'))).toHaveLength(0);
  });
  it('binds checkout to the session customer, stamps metadata and only stores free until webhook',async()=>{
    const {ctx}=setup();const s=await web(ctx);
    const res=await appFor(ctx)('/v1/billing/checkout',post({priceKey:'pro_monthly'},s.headers));expect(res.status).toBe(200);
    const call=ctx.net.calls.find(c=>c.method==='POST'&&c.url.endsWith('/checkout/sessions'));
    const body=new URLSearchParams(call?.body??'');expect(body.get('customer')).toBe(customer);expect(body.get('client_reference_id')).toBe(s.userId);expect(body.get('metadata[user_id]')).toBe(s.userId);expect(body.get('subscription_data[metadata][user_id]')).toBe(s.userId);
    expect(body.get('success_url')).toBe(origin+'/billing/success');expect(body.get('cancel_url')).toBe(origin+'/billing/cancelled');expect(body.get('line_items[0][price]')).toBe('price_monthly');
    expect(call?.headers.get('idempotency-key')).toBeTruthy();expect(await getBillingPlan(ctx.env,s.userId)).toMatchObject({plan:'free'});
  });
  it('starts the advertised 7-day trial on a first subscription only',async()=>{
    const {ctx}=setup();const s=await web(ctx);const app=appFor(ctx);
    expect(await getBillingPlan(ctx.env,s.userId)).toMatchObject({trialEligible:true,canManage:false});
    expect((await app('/v1/billing/checkout',post({priceKey:'pro_annual'},s.headers))).status).toBe(200);
    const first=new URLSearchParams(ctx.net.calls.find(c=>c.method==='POST'&&c.url.endsWith('/checkout/sessions'))?.body??'');
    expect(first.get('subscription_data[trial_period_days]')).toBe('7');
    // A returning customer (an earlier subscription, now canceled) gets no second trial, even if local state lags.
    ctx.net.on('GET','https://api.stripe.com/v1/subscriptions',{data:[subscription('canceled')],has_more:false});
    expect((await app('/v1/billing/checkout',post({priceKey:'pro_monthly'},s.headers))).status).toBe(200);
    const again=new URLSearchParams(ctx.net.calls.filter(c=>c.method==='POST'&&c.url.endsWith('/checkout/sessions')).at(-1)?.body??'');
    expect(again.has('subscription_data[trial_period_days]')).toBe(false);
  });
  it('keeps the portal reachable after a fall back to Free, and reports trial use',async()=>{
    const {ctx}=setup();const s=await web(ctx);await mapped(ctx,s.userId);
    await ctx.db.prepare("UPDATE billing_accounts SET plan='free',status='canceled',subscription_id=NULL WHERE user_id=?").bind(s.userId).run();
    expect(await getBillingPlan(ctx.env,s.userId)).toMatchObject({plan:'free',status:'canceled',trialEligible:false,canManage:true});
    expect((await appFor(ctx)('/v1/billing/portal',post({},s.headers))).status).toBe(200);
    await ctx.db.prepare("UPDATE billing_accounts SET deleting=1 WHERE user_id=?").bind(s.userId).run();
    expect(await getBillingPlan(ctx.env,s.userId)).toMatchObject({canManage:false});
  });
  it('uses only the mapped customer for portal and rejects attacker links from upstream',async()=>{
    const {ctx}=setup();const s=await web(ctx);await mapped(ctx,s.userId);const app=appFor(ctx);
    expect((await app('/v1/billing/portal',post({},s.headers))).status).toBe(200);
    expect(new URLSearchParams(ctx.net.calls.at(-1)?.body??'').get('customer')).toBe(customer);
    ctx.net.on('POST','https://api.stripe.com/v1/billing_portal/sessions',{url:'https://billing.stripe.com.evil.example'});
    expect((await app('/v1/billing/portal',post({},s.headers))).status).toBe(502);
  });
  it('reuses open checkout and refuses a second active subscription',async()=>{
    const {ctx}=setup();const s=await web(ctx);await mapped(ctx,s.userId);const app=appFor(ctx);
    ctx.net.on('GET','https://api.stripe.com/v1/checkout/sessions',{data:[{id:'cs_open',status:'open',url:'https://checkout.stripe.com/c/pay/open',metadata:{price_key:'pro_monthly'}}],has_more:false});
    const res=await app('/v1/billing/checkout',post({priceKey:'pro_monthly'},s.headers));expect(await res.json()).toMatchObject({url:'https://checkout.stripe.com/c/pay/open'});
    ctx.net.on('GET','https://api.stripe.com/v1/subscriptions',{data:[subscription()],has_more:false});
    expect((await app('/v1/billing/checkout',post({priceKey:'pro_monthly'},s.headers))).status).toBe(403);
  });
  it('rejects live credentials and active operation locks',async()=>{
    const {ctx}=setup();const s=await web(ctx);await mapped(ctx,s.userId);
    ctx.env.STRIPE_SECRET_KEY=['sk','live','placeholder'].join('_');
    expect((await appFor(ctx)('/v1/billing/portal',post({},s.headers))).status).toBe(500);
    ctx.env.STRIPE_SECRET_KEY=['sk','test','placeholder'].join('_');
    await ctx.db.prepare("UPDATE billing_accounts SET operation_token='busy'").run();
    expect((await appFor(ctx)('/v1/billing/checkout',post({priceKey:'pro_monthly'},s.headers))).status).toBe(429);
  });
});
describe('verified billing events',()=>{
  it('rejects tampering, old/future timestamps and unsigned data before queueing',async()=>{
    const {ctx,messages}=setup();const good=event(ctx);const call=appFor(ctx);
    expect((await call('/v1/webhooks/stripe',{method:'POST',body:good.raw,headers:{'stripe-signature':good.signature}})).status).toBe(200);
    for(const value of [event(ctx,'evt_old','invoice.paid',Math.floor(ctx.time.now().getTime()/1000)-301),event(ctx,'evt_future','invoice.paid',Math.floor(ctx.time.now().getTime()/1000)+301),{raw:good.raw+' ',signature:good.signature},{raw:'{',signature:''}])expect((await call('/v1/webhooks/stripe',{method:'POST',body:value.raw,headers:{'stripe-signature':value.signature}})).status).toBe(403);
    expect(messages).toHaveLength(1);
  });
  it('accepts a valid rotated v1 signature and records a single durable event',async()=>{
    const {ctx}=setup();const good=event(ctx);
    await verifyStripeEvent(good.raw,good.signature+',v1='+'0'.repeat(64),ctx.env,ctx.time.now());
    await acceptStripeEvent(ctx.env,ctx.deps,good.raw,good.signature);await acceptStripeEvent(ctx.env,ctx.deps,good.raw,good.signature);
    expect(ctx.db.rows('SELECT * FROM stripe_events')).toHaveLength(1);
  });
  it('keeps pending inbox entries when queue send fails',async()=>{
    const {ctx}=setup();ctx.env.STRIPE_EVENTS={send:async()=>{throw new Error('queue down');}};
    const good=event(ctx);await expect(acceptStripeEvent(ctx.env,ctx.deps,good.raw,good.signature)).rejects.toMatchObject({code:'upstream_unavailable'});
    expect(ctx.db.rows('SELECT status FROM stripe_events')).toEqual([{status:'pending'}]);
  });
  it('applies canonical subscription state once and handles old events without regressing',async()=>{
    const {ctx}=setup();const s=await web(ctx);await mapped(ctx,s.userId);let sub=subscription();
    ctx.net.on('GET','https://api.stripe.com/v1/subscriptions',()=>json({data:[sub],has_more:false}));
    let signed=event(ctx);await acceptStripeEvent(ctx.env,ctx.deps,signed.raw,signed.signature);await processStripeEvent(ctx.env,ctx.deps,'evt_test');
    expect(await getBillingPlan(ctx.env,s.userId)).toMatchObject({plan:'pro',status:'active'});
    const requests=ctx.net.calls.length;await processStripeEvent(ctx.env,ctx.deps,'evt_test');expect(ctx.net.calls).toHaveLength(requests);
    sub=subscription('canceled');signed=event(ctx,'evt_cancel');await acceptStripeEvent(ctx.env,ctx.deps,signed.raw,signed.signature);await processStripeEvent(ctx.env,ctx.deps,'evt_cancel');expect(await getBillingPlan(ctx.env,s.userId)).toMatchObject({plan:'free'});
    signed=event(ctx,'evt_delayed','checkout.session.completed');await acceptStripeEvent(ctx.env,ctx.deps,signed.raw,signed.signature);await processStripeEvent(ctx.env,ctx.deps,'evt_delayed');expect(await getBillingPlan(ctx.env,s.userId)).toMatchObject({plan:'free'});
  });
  it('follows trial, cancel-at-period-end, failed payment, annual upgrade and recovery from canonical state',async()=>{
    const {ctx}=setup();const s=await web(ctx);await mapped(ctx,s.userId);let sub:ReturnType<typeof subscription>=subscription('trialing');let n=0;
    ctx.net.on('GET','https://api.stripe.com/v1/subscriptions',()=>json({data:[sub],has_more:false}));
    const apply=async(type='customer.subscription.updated')=>{const id=`evt_state_${++n}`;const signed=event(ctx,id,type);await acceptStripeEvent(ctx.env,ctx.deps,signed.raw,signed.signature);await processStripeEvent(ctx.env,ctx.deps,id);return getBillingPlan(ctx.env,s.userId);};
    expect(await apply('customer.subscription.created')).toMatchObject({plan:'pro',status:'trialing',renewsAt:new Date(1800000000*1000).toISOString(),cancelAt:null,trialEligible:false,canManage:true});
    sub={...subscription('active'),cancel_at_period_end:true};
    expect(await apply()).toMatchObject({plan:'pro',status:'active',renewsAt:null,cancelAt:new Date(1800000000*1000).toISOString()});
    sub=subscription('past_due');
    expect(await apply('invoice.payment_failed')).toMatchObject({plan:'free',status:'past_due',canManage:true});
    sub=subscription('unpaid');
    expect(await apply()).toMatchObject({plan:'free',status:'unpaid'});
    sub={...subscription('active'),items:{data:[{price:{id:'price_annual'},current_period_end:1900000000}]}};
    expect(await apply('invoice.paid')).toMatchObject({plan:'pro',status:'active',renewsAt:new Date(1900000000*1000).toISOString(),cancelAt:null});
  });
  it('does not grant pro for an unapproved price',async()=>{
    const {ctx}=setup();const s=await web(ctx);await mapped(ctx,s.userId);const sub=subscription();sub.items.data=[{price:{id:'price_other'},current_period_end:1800000000}];ctx.net.on('GET','https://api.stripe.com/v1/subscriptions',{data:[sub],has_more:false});const good=event(ctx);await acceptStripeEvent(ctx.env,ctx.deps,good.raw,good.signature);await processStripeEvent(ctx.env,ctx.deps,'evt_test');expect(await getBillingPlan(ctx.env,s.userId)).toMatchObject({plan:'free'});
  });
});
describe('cancel before deletion',()=>{
  it('expires checkout, confirms cancellation then revokes GitHub and deletes data',async()=>{
    const {ctx}=setup();const s=await web(ctx);await mapped(ctx,s.userId);
    ctx.net.on('GET','https://api.stripe.com/v1/checkout/sessions',{data:[{id:'cs_open',status:'open',url:null}],has_more:false})
      .on('POST','https://api.stripe.com/v1/checkout/sessions/cs_open/expire',{id:'cs_open',status:'expired'})
      .on('GET','https://api.stripe.com/v1/subscriptions',{data:[subscription()],has_more:false})
      .on('DELETE','https://api.stripe.com/v1/subscriptions/sub_testbilling',{id:'sub_testbilling',status:'canceled'})
      .on('DELETE','https://api.github.com/applications/',()=>new Response(null,{status:204}));
    const res=await appFor(ctx)('/v1/account',{method:'DELETE',headers:s.headers});expect(res.status).toBe(204);
    const cancel=ctx.net.calls.findIndex(c=>c.method==='DELETE'&&c.url.includes('/subscriptions/'));const revoke=ctx.net.calls.findIndex(c=>c.method==='DELETE'&&c.url.includes('/applications/'));expect(cancel).toBeGreaterThan(-1);expect(revoke).toBeGreaterThan(cancel);
    expect(ctx.db.rows('SELECT * FROM users')).toEqual([]);expect(ctx.db.rows('SELECT * FROM billing_accounts')).toEqual([]);
  });
  it('preserves account and blocks new checkouts when cancellation fails',async()=>{
    const {ctx}=setup();const s=await web(ctx);await mapped(ctx,s.userId);
    ctx.net.on('GET','https://api.stripe.com/v1/subscriptions',{data:[subscription()],has_more:false}).on('DELETE','https://api.stripe.com/v1/subscriptions/sub_testbilling',()=>json({error:'unavailable'},500));
    expect((await appFor(ctx)('/v1/account',{method:'DELETE',headers:s.headers})).status).toBe(502);
    expect(ctx.db.rows('SELECT id FROM users')).toHaveLength(1);expect(ctx.net.calls.some(c=>c.method==='DELETE'&&c.url.includes('/applications/'))).toBe(false);
    expect((await appFor(ctx)('/v1/billing/checkout',post({priceKey:'pro_monthly'},s.headers))).status).toBe(429);
  });
});
