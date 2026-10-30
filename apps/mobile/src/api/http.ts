import { BillingLink, BillingPlan as BillingPlanSchema, MetaKeyInput, MetaKeyStatus, PostList, Post, PostSlug, PushTokenRegistered, WebPushKey, Settings as SettingsSchema } from "@mergemate/contracts";
import type { BillingPlan, PublicPost, UserSettings } from "../types";
import { type ApiClient } from "./client";
import { ApiClientError, messageForCode } from "./errors";
import { mapBillingPlan, mapPostSummary } from "./mappers";
import { SupportReceived } from "./schemas";
import { CHECKOUT_HOSTS, httpsUrlOnHosts, PORTAL_HOSTS } from "./urls";
import { enc } from "./http-types";
import { HttpData } from "./http-data";

export type { HttpApiClientOptions, TokenStore } from "./http-types";
export class HttpApiClient extends HttpData implements ApiClient {
  // ---------------------------------------------------------------------------------------------
  // Settings, push and Meta key
  // ---------------------------------------------------------------------------------------------

  async getSettings(): Promise<UserSettings> {
    this.settingsCache = await this.request({ path: "/settings", schema: SettingsSchema });
    return this.settingsCache;
  }

  async updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const current = this.settingsCache ?? (await this.getSettings());
    // The API takes the full object, so merge the change into what is stored.
    const merged: UserSettings = {
      ...current,
      ...settings,
      notifications: { ...current.notifications, ...settings.notifications },
    };
    this.settingsCache = await this.request({
      method: "PUT",
      path: "/settings",
      body: merged,
      schema: SettingsSchema,
    });
    return this.settingsCache;
  }

  async registerPushToken(deviceId: string, token: string): Promise<void> {
    await this.request({
      method: "POST",
      path: "/push/tokens",
      body: { deviceId, token },
      schema: PushTokenRegistered,
    });
  }

  async unregisterPushToken(deviceId: string): Promise<void> {
    await this.request({ method: "DELETE", path: "/push/tokens", body: { deviceId } });
  }

  async getWebPushKey(): Promise<string | null> {
    try {
      return (await this.request({ path: "/push/web-key", schema: WebPushKey })).publicKey;
    } catch (e) {
      // An API without the feature (or without a key configured) answers not_found; the settings row is left out.
      if (e instanceof ApiClientError && e.code === "not_found") return null;
      throw e;
    }
  }

  async registerWebPush(deviceId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
    await this.request({ method: "POST", path: "/push/web", body: { deviceId, ...subscription }, schema: PushTokenRegistered });
  }

  async unregisterWebPush(deviceId: string): Promise<void> {
    await this.request({ method: "DELETE", path: "/push/web", body: { deviceId } });
  }

  async getMetaKeyStatus(): Promise<{ configured: boolean } | null> {
    try {
      const res = await this.request({ path: "/settings/meta-key", schema: MetaKeyStatus });
      return { configured: res.configured };
    } catch (e) {
      // An API without the feature answers not_found; the settings row is simply left out.
      if (e instanceof ApiClientError && e.code === "not_found") return null;
      throw e;
    }
  }

  async saveMetaKey(key: string): Promise<void> {
    if (!this.web) throw new ApiClientError("forbidden", "Add your Meta key in the web app.");
    const body = MetaKeyInput.safeParse({ key: key.trim() });
    if (!body.success) {
      throw new ApiClientError("validation_failed", "That doesn't look like a Meta key. Check it and try again.");
    }
    await this.request({ method: "PUT", path: "/settings/meta-key", body: body.data, schema: MetaKeyStatus });
  }

  async removeMetaKey(): Promise<void> {
    if (!this.web) throw new ApiClientError("forbidden", "Manage your Meta key in the web app.");
    await this.request({ method: "DELETE", path: "/settings/meta-key" });
  }

  // ---------------------------------------------------------------------------------------------
  // Billing (checkout and portal are web only)
  // ---------------------------------------------------------------------------------------------

  async getBillingPlan(): Promise<BillingPlan> {
    return mapBillingPlan(await this.request({ path: "/billing/plan", schema: BillingPlanSchema }));
  }

  async createCheckoutSession(priceKey: "pro_monthly" | "pro_annual") {
    return this.billingLink("/billing/checkout", CHECKOUT_HOSTS, { priceKey });
  }

  async createPortalSession() {
    return this.billingLink("/billing/portal", PORTAL_HOSTS);
  }

  protected async billingLink(path: string, hosts: readonly string[], body?: unknown): Promise<{ url: string }> {
    if (!this.web) throw new ApiClientError("forbidden", "Manage your plan in the web app.");
    const res = await this.request({ method: "POST", path, body, schema: BillingLink });
    // Only Stripe's own pages may be opened.
    const url = httpsUrlOnHosts(res.url, hosts);
    if (!url) throw new ApiClientError("parse_failed", messageForCode("parse_failed"));
    return { url };
  }

  // ---------------------------------------------------------------------------------------------
  // Public content
  // ---------------------------------------------------------------------------------------------

  async getPublicPosts(type: "news" | "changelog"): Promise<PublicPost[]> {
    return (await this.getPublicPostPage(type)).items;
  }

  async getPublicPostPage(type:"news"|"changelog",cursor?:string|null):Promise<{items:PublicPost[];nextCursor:string|null}> {
    if(cursor && (!/^\d+$/.test(cursor) || Number(cursor)>10_000))throw new ApiClientError("validation_failed",messageForCode("validation_failed"));
    const res=await this.request({path:`/public/posts?type=${enc(type)}${cursor?`&cursor=${enc(cursor)}`:''}`,auth:false,schema:PostList});
    if(res.nextCursor!==null && (!/^\d+$/.test(res.nextCursor) || Number(res.nextCursor)<=Number(cursor??0) || Number(res.nextCursor)>10_000))throw new ApiClientError("parse_failed",messageForCode("parse_failed"));
    const seen=new Set<string>();
    return {items:res.items.filter(post=>{if(seen.has(post.slug))return false;seen.add(post.slug);return true;}).map(mapPostSummary),nextCursor:res.nextCursor};
  }

  async getPublicPost(slug:string):Promise<PublicPost> {
    if(!PostSlug.safeParse(slug).success)throw new ApiClientError("not_found",messageForCode("not_found"));
    const post=await this.request({path:`/public/posts/${enc(slug)}`,auth:false,schema:Post});
    if(post.slug!==slug)throw new ApiClientError("parse_failed",messageForCode("parse_failed"));
    return mapPostSummary(post);
  }

  async sendSupportMessage(email: string, message: string): Promise<void> {
    if (!this.turnstile) throw new ApiClientError("bot_check_unavailable", messageForCode("bot_check_unavailable"));
    const turnstileToken = await this.turnstile();
    await this.request({
      method: "POST",
      path: "/public/support",
      auth: false,
      body: { email: email.trim(), message, turnstileToken },
      schema: SupportReceived,
    });
  }
}
