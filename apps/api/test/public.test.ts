import { ErrorBody, PostList } from "@mergemate/contracts";
import { describe, expect, it } from "vitest";
import { sanitizeMarkdown } from "../src/routes/public";
import { json, type TestContext, testContext } from "./helpers";
import { appFor, post } from "./sign-in";

const summary = (slug: string, type: "news" | "changelog", publishedAt: string) => ({
  slug,
  type,
  title: `Title ${slug} & <more>`,
  excerpt: `About ${slug}`,
  publishedAt,
});

const seed = (ctx: TestContext) => {
  ctx.kv.set(
    "posts:index",
    JSON.stringify([
      summary("first-news", "news", "2026-10-20T10:00:00Z"),
      summary("v1-0", "changelog", "2026-10-25T10:00:00Z"),
      summary("latest-news", "news", "2026-10-26T10:00:00Z"),
      { slug: "Bad Slug!", type: "news", title: "x", excerpt: "", publishedAt: "2026-10-26T10:00:00Z" },
      { slug: "no-type", title: "x", excerpt: "", publishedAt: "2026-10-26T10:00:00Z" },
    ]),
  );
  ctx.kv.set(
    "posts:latest-news",
    JSON.stringify({
      ...summary("latest-news", "news", "2026-10-26T10:00:00Z"),
      body: "Hello <script>alert(1)</script> **world** ![x](https://img.example/a.png) [ok](https://github.com/x) [bad](javascript:alert(1)) [rel](/internal)\n[ref]: http://insecure.example\n<!-- note -->",
    }),
  );
};

describe("public posts", () => {
  it("lists only valid entries, newest first, filtered by type and admitted before each network read", async () => {
    const ctx = testContext();
    seed(ctx);
    const call = appFor(ctx);
    const all = await call("/v1/public/posts");
    expect(all.headers.get("cache-control")).toBe("no-store");
    expect(PostList.parse(await all.json()).items.map((p) => p.slug)).toEqual(["latest-news", "v1-0", "first-news"]);
    const news = PostList.parse(await (await call("/v1/public/posts?type=news")).json());
    expect(news.items.map((p) => p.slug)).toEqual(["latest-news", "first-news"]);
    expect((await call("/v1/public/posts?type=secret")).status).toBe(422);
  });

  it("returns an empty list when nothing is published", async () => {
    const ctx = testContext();
    expect(PostList.parse(await (await appFor(ctx)("/v1/public/posts")).json())).toEqual({ items: [], nextCursor: null });
  });

  it("serves one post with raw HTML, images and non-https links removed", async () => {
    const ctx = testContext();
    seed(ctx);
    const res = await appFor(ctx)("/v1/public/posts/latest-news");
    expect(res.status).toBe(200);
    const body = ((await res.json()) as { body: string }).body;
    expect(body).not.toMatch(/<script|<!--|img\.example|javascript:|http:\/\/insecure/);
    expect(body).toContain("[ok](https://github.com/x)");
    expect(body).toContain("bad");
    expect(body).toContain("rel");
    expect(body).toContain("**world**");
  });

  it("returns 404 for unknown, malformed or invalid posts", async () => {
    const ctx = testContext();
    seed(ctx);
    ctx.kv.set("posts:broken", JSON.stringify({ slug: "broken" }));
    const call = appFor(ctx);
    for (const slug of ["missing", "broken", "..%2Fposts%3Aindex", "UPPER"]) {
      const res = await call(`/v1/public/posts/${slug}`);
      expect(res.status, slug).toBe(404);
      expect(ErrorBody.parse(await res.json()).error.code).toBe("not_found");
    }
  });

  it("publishes an escaped RSS feed linking to the public site", async () => {
    const ctx = testContext();
    seed(ctx);
    const res = await appFor(ctx)("/v1/public/posts/rss.xml");
    expect(res.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
    const xml = await res.text();
    expect(xml).toContain("<link>https://dev.mergemate.dev/news/latest-news</link>");
    expect(xml).toContain("Title latest-news &amp; &lt;more&gt;");
    expect(xml).not.toContain("<more>");
    expect(xml.match(/<item>/g)).toHaveLength(3);
  });

  it("strips HTML but leaves ordinary text alone", () => {
    expect(sanitizeMarkdown("a < b and c > d")).toBe("a < b and c > d");
    expect(sanitizeMarkdown('<a href="x">t</a>')).toBe("t");
  });
});

describe("POST /v1/public/support", () => {
  const valid = { email: "person@example.test", message: "The app shows an error.", turnstileToken: "tt" };

  const mockOk = (ctx: TestContext) =>
    ctx.net
      .on("POST", "https://challenges.cloudflare.com/turnstile/v0/siteverify", () => json({ success: true }))
      .on("POST", "https://api.resend.com/emails", () => json({ id: "e1" }));

  it("verifies the bot check and sends plain text with fixed to/from and the sender as reply-to", async () => {
    const ctx = testContext();
    mockOk(ctx);
    const res = await appFor(ctx)("/v1/public/support", post(valid));
    expect(res.status).toBe(202);
    const sent = ctx.net.calls.find((c) => c.url === "https://api.resend.com/emails");
    expect(sent?.headers.get("authorization")).toBe("Bearer test-resend-not-real");
    const body = JSON.parse(sent?.body ?? "{}");
    expect(body).toMatchObject({
      from: "MergeMate <noreply@example.test>",
      to: ["support@example.test"],
      reply_to: "person@example.test",
      subject: "MergeMate support request",
    });
    expect(body.html).toBeUndefined();
    expect(body.text).toContain("The app shows an error.");
    expect(ctx.supportLimiter.keys).toHaveLength(1);
  });

  it.each([
    ["header injection", { ...valid, email: "a@example.test\r\nBcc: victim@example.test" }],
    ["display name", { ...valid, email: "Evil <a@example.test>" }],
    ["empty message", { ...valid, message: "   " }],
    ["long message", { ...valid, message: "x".repeat(5001) }],
  ])("rejects %s without sending", async (_name, body) => {
    const ctx = testContext();
    mockOk(ctx);
    expect((await appFor(ctx)("/v1/public/support", post(body))).status).toBe(422);
    expect(ctx.net.calls).toHaveLength(0);
  });

  it("does not send when the bot check fails", async () => {
    const ctx = testContext();
    ctx.net.on("POST", "https://challenges.cloudflare.com/turnstile/v0/siteverify", () => json({ success: false }));
    expect((await appFor(ctx)("/v1/public/support", post(valid))).status).toBe(403);
    expect(ctx.net.calls.some((c) => c.url.includes("resend"))).toBe(false);
  });

  it("is rate limited per IP before any work", async () => {
    const ctx = testContext({ SUPPORT_RATE_LIMITER: { limit: async () => ({ success: false }) } });
    const res = await appFor(ctx)("/v1/public/support", post(valid, { "cf-connecting-ip": "203.0.113.9" }));
    expect(res.status).toBe(429);
    expect(ctx.net.calls).toHaveLength(0);
  });

  it("reports a send failure honestly", async () => {
    const ctx = testContext();
    ctx.net
      .on("POST", "https://challenges.cloudflare.com/turnstile/v0/siteverify", () => json({ success: true }))
      .on("POST", "https://api.resend.com/emails", () => json({ message: "nope" }, 500));
    expect((await appFor(ctx)("/v1/public/support", post(valid))).status).toBe(502);
  });
});
it("deduplicates index slugs deterministically and keeps only the newest publication",async()=>{
  const ctx=testContext();const older=summary('one','news','2026-10-20T10:00:00Z');const newer={...older,publishedAt:'2026-10-28T10:00:00Z',title:'New title'};
  ctx.kv.set('posts:index',JSON.stringify([older,newer,older]));
  const response=await appFor(ctx)('/v1/public/posts?type=news');
  expect(PostList.parse(await response.json()).items).toEqual([newer]);
});
it("never serves an unlisted or mismatched published snapshot or private fields",async()=>{
  const ctx=testContext();const post={...summary('hidden','news','2026-10-28T10:00:00Z'),body:'Published only after index commit',draft_json:'private',actor_email:'private'};
  ctx.kv.set('posts:hidden',JSON.stringify(post));
  const call=appFor(ctx);expect((await call('/v1/public/posts/hidden')).status).toBe(404);
  ctx.kv.set('posts:index',JSON.stringify([{...post,publishedAt:'2026-10-20T10:00:00Z'}]));
  expect((await call('/v1/public/posts/hidden')).status).toBe(404);
  ctx.kv.set('posts:index',JSON.stringify([post]));
  const response=await call('/v1/public/posts/hidden');expect(response.status).toBe(200);
  const body=await response.json() as Record<string,unknown>;expect(body.body).toBe(post.body);expect(body.draft_json).toBeUndefined();expect(body.actor_email).toBeUndefined();
});

it("reports malformed/unavailable indexes instead of fabricated empty updates",async()=>{
  const ctx=testContext();ctx.kv.set('posts:index',JSON.stringify({private:'not-an-index'}));
  const response=await appFor(ctx)('/v1/public/posts');expect(response.status).toBe(502);expect(response.headers.get('cache-control')).toBe('no-store');
});

it("pages a bounded public index without duplicate slugs",async()=>{
  const ctx=testContext();const entries=Array.from({length:53},(_,n)=>summary(`post-${n}`,'news','2026-10-28T10:00:00Z'));
  ctx.kv.set('posts:index',JSON.stringify(entries));const call=appFor(ctx);
  const first=PostList.parse(await (await call('/v1/public/posts?type=news')).json());
  const second=PostList.parse(await (await call('/v1/public/posts?type=news&cursor='+first.nextCursor)).json());
  expect(first.items).toHaveLength(50);expect(second.items).toHaveLength(3);expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items,...second.items].map(p=>p.slug)).size).toBe(53);
  expect((await call('/v1/public/posts?cursor=10001')).status).toBe(422);
});
