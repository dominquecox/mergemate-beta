import { z } from 'zod';

/** Input-only secret. Never part of a settings read response. */
export const MetaKeyInput = z.object({ key: z.string().min(16).max(512).regex(/^[!-~]+$/) }).strict();
export type MetaKeyInput = z.infer<typeof MetaKeyInput>;
export const MetaKeyStatus = z.object({ configured: z.boolean() }).strict();
export type MetaKeyStatus = z.infer<typeof MetaKeyStatus>;
