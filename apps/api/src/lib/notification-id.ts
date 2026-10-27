import { base64url } from "./crypto";

/** Opaque, URL-safe id shared by inbox items and push deep links. */
export const notificationId = (repo: string, number: number) =>
  base64url(new TextEncoder().encode(`${repo}#${number}`));
