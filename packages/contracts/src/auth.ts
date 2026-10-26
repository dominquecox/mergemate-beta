import { z } from "zod";
import { IsoDateTime } from "./common";

export const User = z.object({
  id: z.string(),
  login: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.url(),
});
export type User = z.infer<typeof User>;

export const Session = z.object({
  token: z.string().min(1),
  expiresAt: IsoDateTime,
  /** Present and true only for demo sessions on seeded data. */
  demo: z.literal(true).optional(),
});
export type Session = z.infer<typeof Session>;

export const AuthStartRequest = z.object({
  codeChallenge: z.string().min(43).max(128),
});
export type AuthStartRequest = z.infer<typeof AuthStartRequest>;

export const AuthStartResponse = z.object({
  authorizeUrl: z.url(),
  state: z.string().min(1),
});
export type AuthStartResponse = z.infer<typeof AuthStartResponse>;

export const AuthCallbackRequest = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
});
export type AuthCallbackRequest = z.infer<typeof AuthCallbackRequest>;

export const AuthCallbackResponse = z.object({
  session: Session,
  user: User,
});
export type AuthCallbackResponse = z.infer<typeof AuthCallbackResponse>;
