import { z } from "zod";
import { IsoDateTime } from "./common";

export const PostType = z.enum(["news", "changelog"]);
export type PostType = z.infer<typeof PostType>;

export const PostSlug = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/);

/**
 * Published post as stored by the staff tool in KV: `posts:index` holds a JSON array of
 * PostSummary, `posts:<slug>` holds one Post. The public API serves only entries that parse.
 */
export const PostSummary = z.object({
  slug: PostSlug,
  type: PostType,
  title: z.string().min(1).max(200),
  excerpt: z.string().max(500),
  publishedAt: IsoDateTime,
});
export type PostSummary = z.infer<typeof PostSummary>;

export const Post = PostSummary.extend({
  /** Markdown. Served with raw HTML and images removed; render as sanitized markdown. */
  body: z.string().max(100_000),
  /** Changelog version label, e.g. `1.2.0`. */
  version: z.string().max(32).optional(),
});
export type Post = z.infer<typeof Post>;

export const PostList = z.object({
  items: z.array(PostSummary),
  nextCursor: z.string().nullable(),
});
export type PostList = z.infer<typeof PostList>;

export const SupportRequest = z.object({
  email: z
    .string()
    .max(254)
    .regex(/^[^\s@<>()",;:\\[\]]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/),
  message: z.string().trim().min(1).max(5000),
  turnstileToken: z.string().min(1).max(2048),
});
export type SupportRequest = z.infer<typeof SupportRequest>;
