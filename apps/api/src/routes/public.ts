import { Post, type PostList, PostSlug, PostSummary, PostType, SupportRequest } from "@mergemate/contracts";
import { type Context, Hono } from "hono";
import { requireBinding, requireVar, siteOrigin } from "../config";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";
import { clientIp, limit } from "../middleware/rate-limit";
import { verifyTurnstile } from "../lib/turnstile";
import { parseBody, parseValue } from "../lib/validate";

const PAGE_SIZE = 50;
const RSS_ITEMS = 20;
const PUBLIC_CACHE = "public, max-age=60";
const RESEND_URL = "https://api.resend.com/emails";

/** Reads the published index from KV, keeping only entries that match the contract. */
const readIndex = async (c: Context<AppEnv>) => {
  const raw: unknown = await requireBinding(c.env, "POSTS").get("posts:index", "json");
  const entries = Array.isArray(raw) ? raw : [];
  return entries
    .flatMap((e) => {
      const parsed = PostSummary.safeParse(e);
      return parsed.success ? [parsed.data] : [];
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
};

/**
 * Defense in depth for public markdown: drops raw HTML and images, and keeps only https links.
 * Clients still render it as sanitized markdown.
 */
export const sanitizeMarkdown = (md: string) =>
  md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g, (_m, text: string, url: string) =>
      url.startsWith("https://") ? `[${text}](${url})` : text,
    )
    .replace(/^\s*\[[^\]]+\]:\s*(?!https:\/\/)\S+.*$/gm, "");

const xml = (s: string) =>
  s.replace(/[<>&'"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[ch] ?? ch);

const postUrl = (c: Context<AppEnv>, post: PostSummary) => `${siteOrigin(c.env)}/${post.type}/${post.slug}`;

export const publicContent = new Hono<AppEnv>()
  .get("/public/posts", async (c) => {
    const type = c.req.query("type");
    const filter = type === undefined ? undefined : parseValue(PostType, type);
    const cursor = c.req.query("cursor");
    const offset = cursor ? Number(cursor) : 0;
    if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) {
      throw new ApiError("validation_failed", "The cursor is not valid.");
    }
    const all = (await readIndex(c)).filter((p) => !filter || p.type === filter);
    const items = all.slice(offset, offset + PAGE_SIZE);
    const res: PostList = { items, nextCursor: offset + PAGE_SIZE < all.length ? String(offset + PAGE_SIZE) : null };
    c.header("cache-control", PUBLIC_CACHE);
    return c.json(res);
  })

  .get("/public/posts/rss.xml", async (c) => {
    const origin = siteOrigin(c.env);
    const items = (await readIndex(c)).slice(0, RSS_ITEMS);
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>MergeMate</title>
<link>${xml(origin)}</link>
<description>MergeMate news and changelog</description>
${items
  .map(
    (p) => `<item>
<title>${xml(p.title)}</title>
<link>${xml(postUrl(c, p))}</link>
<guid isPermaLink="true">${xml(postUrl(c, p))}</guid>
<category>${p.type}</category>
<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
<description>${xml(p.excerpt)}</description>
</item>`,
  )
  .join("\n")}
</channel>
</rss>
`;
    return c.body(body, 200, { "content-type": "application/rss+xml; charset=utf-8", "cache-control": PUBLIC_CACHE });
  })

  .get("/public/posts/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!PostSlug.safeParse(slug).success) throw new ApiError("not_found", "Not found.");
    const raw: unknown = await requireBinding(c.env, "POSTS").get(`posts:${slug}`, "json");
    const post = Post.safeParse(raw);
    if (!post.success || post.data.slug !== slug) throw new ApiError("not_found", "Not found.");
    c.header("cache-control", PUBLIC_CACHE);
    return c.json({ ...post.data, body: sanitizeMarkdown(post.data.body) } satisfies Post);
  })

  .post("/public/support", async (c) => {
    await limit(c, {
      name: "SUPPORT_RATE_LIMITER",
      limiter: c.env.SUPPORT_RATE_LIMITER,
      key: clientIp(c),
      retryAfter: 60,
    });
    const body = await parseBody(c, SupportRequest);
    await verifyTurnstile(c, body.turnstileToken);

    // To and from are fixed config; the sender's address is only the reply-to. The schema rejects
    // whitespace (so CR/LF) in the address, and the subject is constant.
    let res: Response;
    try {
      res = await c.get("deps").fetch(RESEND_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${requireVar(c.env, "RESEND_API_KEY")}`,
          "content-type": "application/json",
          "idempotency-key": c.get("requestId"),
        },
        body: JSON.stringify({
          from: requireVar(c.env, "EMAIL_FROM"),
          to: [requireVar(c.env, "SUPPORT_EMAIL")],
          reply_to: body.email,
          subject: "MergeMate support request",
          text: `Reply-to: ${body.email}\nRequest id: ${c.get("requestId")}\n\n${body.message}`,
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ApiError("upstream_unavailable", "Could not send your message. Try again.");
    }
    if (!res.ok) throw new ApiError("upstream_unavailable", "Could not send your message. Try again.");
    return c.json({ received: true }, 202);
  });
