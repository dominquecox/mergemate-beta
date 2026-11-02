import { describe, expect, it } from "vitest";
import { callbackUrl, corsOrigins, siteOrigin } from "../src/config";
import { ConfigError } from "../src/errors";
import { billingOrigin } from "../src/lib/stripe";
import { testContext } from "./helpers";
import { appFor, post, verifierPair } from "./sign-in";

const APP = "https://app.mergemate.dev";
const SITE = "https://mergemate.dev";
const DEV = "https://dev.mergemate.dev";
const LOCAL = "http://localhost:8081";

const prod = (extra = {}) => testContext({ APP_ENV: "production", WEB_ORIGIN: APP, SITE_ORIGIN: SITE, ...extra });
const dev = (extra = {}) => testContext({ APP_ENV: "development", WEB_ORIGIN: DEV, SITE_ORIGIN: DEV, ...extra });

const allowOrigin = async (ctx: ReturnType<typeof testContext>, origin: string) =>
  (await appFor(ctx)("/v1/health", { headers: { origin } })).headers.get("access-control-allow-origin");

const authorizeRedirect = async (ctx: ReturnType<typeof testContext>, platform: "ios" | "web") => {
  const res = await appFor(ctx)("/v1/auth/github/start", post({ codeChallenge: verifierPair().challenge, platform }));
  expect(res.status).toBe(200);
  return new URL(((await res.json()) as { authorizeUrl: string }).authorizeUrl).searchParams.get("redirect_uri");
};

describe("CORS origins per environment", () => {
  it("production allows the app origin only", async () => {
    const ctx = prod();
    expect(corsOrigins(ctx.env)).toEqual([APP]);
    expect(await allowOrigin(ctx, APP)).toBe(APP);
    expect(await allowOrigin(ctx, SITE)).toBeNull();
    expect(await allowOrigin(ctx, DEV)).toBeNull();
    expect(await allowOrigin(ctx, LOCAL)).toBeNull();
  });

  it("development allows the dev host and localhost, not production hosts", async () => {
    const ctx = dev();
    expect(await allowOrigin(ctx, DEV)).toBe(DEV);
    expect(await allowOrigin(ctx, LOCAL)).toBe(LOCAL);
    expect(await allowOrigin(ctx, APP)).toBeNull();
    expect(await allowOrigin(ctx, SITE)).toBeNull();
  });
});

describe("sign-in callbacks per environment", () => {
  it("production web and native use the app origin with native relay scoping", async () => {
    const ctx = prod();
    expect(callbackUrl(ctx.env, "web")).toBe(`${APP}/auth/callback`);
    expect(callbackUrl(ctx.env, "ios")).toBe(`${APP}/auth/callback`);
    expect(await authorizeRedirect(ctx, "web")).toBe(`${APP}/auth/callback`);
    expect(await authorizeRedirect(ctx, "ios")).toBe(`${APP}/auth/callback`);
  });

  it("production refuses the marketing site as the web origin", () => {
    const ctx = prod({ WEB_ORIGIN: SITE });
    expect(() => callbackUrl(ctx.env, "web")).toThrow(ConfigError);
  });

  it("development callbacks are unchanged", async () => {
    expect(callbackUrl(dev().env, "ios")).toBe(`${DEV}/auth/callback`);
    expect(callbackUrl(dev().env, "web")).toBe(`${DEV}/auth/callback`);
    expect(callbackUrl(dev({ WEB_ORIGIN: LOCAL }).env, "web")).toBe(`${LOCAL}/auth/callback`);
    expect(await authorizeRedirect(dev({ WEB_ORIGIN: LOCAL }), "ios")).toBe(`${DEV}/auth/callback`);
  });
});

describe("billing return origin", () => {
  it("uses the web origin for the environment", () => {
    expect(billingOrigin(prod().env)).toBe(APP);
    expect(billingOrigin(dev().env)).toBe(DEV);
    expect(billingOrigin(dev({ WEB_ORIGIN: LOCAL }).env)).toBe(LOCAL);
  });

  it("rejects any other origin", () => {
    for (const WEB_ORIGIN of [SITE, DEV, LOCAL, "https://evil.example", "", undefined]) {
      expect(() => billingOrigin(prod({ WEB_ORIGIN }).env), String(WEB_ORIGIN)).toThrow(ConfigError);
    }
    for (const WEB_ORIGIN of [APP, SITE, "https://evil.example"]) {
      expect(() => billingOrigin(dev({ WEB_ORIGIN }).env), WEB_ORIGIN).toThrow(ConfigError);
    }
    const unset = testContext({ WEB_ORIGIN: SITE });
    delete unset.env.APP_ENV;
    expect(() => billingOrigin(unset.env)).toThrow(ConfigError);
  });
});

describe("site origin", () => {
  it("is the public site per environment", () => {
    expect(siteOrigin(prod().env)).toBe(SITE);
    expect(siteOrigin(dev().env)).toBe(DEV);
  });

  it("throws when unset or not allowed for the environment", () => {
    for (const SITE_ORIGIN of [undefined, "", "  ", APP, DEV, LOCAL, "https://evil.example"]) {
      expect(() => siteOrigin(prod({ SITE_ORIGIN }).env), String(SITE_ORIGIN)).toThrow(ConfigError);
    }
    for (const SITE_ORIGIN of [undefined, SITE, APP, LOCAL]) {
      expect(() => siteOrigin(dev({ SITE_ORIGIN }).env), String(SITE_ORIGIN)).toThrow(ConfigError);
    }
  });

  it("builds public post and RSS links from SITE_ORIGIN, not the web origin", async () => {
    const ctx = prod();
    ctx.kv.set(
      "posts:index",
      JSON.stringify([{ slug: "hello", type: "news", title: "Hello", excerpt: "Hi", publishedAt: "2026-10-26T10:00:00Z" }]),
    );
    const xml = await (await appFor(ctx)("/v1/public/posts/rss.xml")).text();
    expect(xml).toContain(`<link>${SITE}</link>`);
    expect(xml).toContain(`<link>${SITE}/news/hello</link>`);
    expect(xml).not.toContain(APP);
  });

  it("fails the RSS feed with a config error when SITE_ORIGIN is missing", async () => {
    const ctx = prod({ SITE_ORIGIN: undefined });
    const res = await appFor(ctx)("/v1/public/posts/rss.xml");
    expect(res.status).toBe(500);
  });
});
