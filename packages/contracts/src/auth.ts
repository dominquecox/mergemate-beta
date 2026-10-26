import { z } from "zod";
import { IsoDateTime } from "./common";

export const User = z.object({
  id: z.string(),
  login: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.url(),
});
export type User = z.infer<typeof User>;

export const Platform = z.enum(["ios", "web"]);
export type Platform = z.infer<typeof Platform>;

/**
 * Native apps get `token` and send it as a Bearer header. Web sessions live in an HttpOnly
 * cookie, so `token` is omitted and `csrfToken` is returned for the `x-csrf-token` header.
 */
export const Session = z.object({
  token: z.string().min(1).optional(),
  expiresAt: IsoDateTime,
  csrfToken: z.string().min(1).optional(),
  /** Present and true only for demo sessions on seeded data. */
  demo: z.literal(true).optional(),
});
export type Session = z.infer<typeof Session>;

export const AuthStartRequest = z.object({
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  platform: Platform,
});
export type AuthStartRequest = z.infer<typeof AuthStartRequest>;

export const AuthStartResponse = z.object({
  authorizeUrl: z.url(),
  state: z.string().min(1),
});
export type AuthStartResponse = z.infer<typeof AuthStartResponse>;

export const AuthCallbackRequest = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(1).max(128),
  codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
});
export type AuthCallbackRequest = z.infer<typeof AuthCallbackRequest>;

export const AuthCallbackResponse = z.object({
  session: Session,
  user: User,
});
export type AuthCallbackResponse = z.infer<typeof AuthCallbackResponse>;

export const DemoRequest = z.object({
  turnstileToken: z.string().min(1).max(2048),
  platform: Platform,
});
export type DemoRequest = z.infer<typeof DemoRequest>;

export const DemoResponse = AuthCallbackResponse;
export type DemoResponse = z.infer<typeof DemoResponse>;

export const RefreshResponse = z.object({
  session: Session,
});
export type RefreshResponse = z.infer<typeof RefreshResponse>;

export const CsrfResponse = z.object({
  csrfToken: z.string().min(1),
});
export type CsrfResponse = z.infer<typeof CsrfResponse>;
