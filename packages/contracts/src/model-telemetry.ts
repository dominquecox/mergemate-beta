import {z} from 'zod';
/** Request-scoped execution evidence, not a cryptographic/hardware attestation. No prompt, image or credentials. */
export const ModelTelemetry=z.object({
 provider:z.enum(['meta','workers-ai']),modelId:z.string().min(1).max(120),
 environment:z.enum(['Cloudflare Workers AI','Meta Model API']),
 latencyMs:z.number().finite().nonnegative(),promptTokens:z.number().int().nonnegative().nullable(),completionTokens:z.number().int().nonnegative().nullable(),
 precision:z.string().max(40).nullable(),observedAt:z.string().datetime(),requestId:z.string().min(1).max(128),
 responseJson:z.string().max(20000),
});
export type ModelTelemetry=z.infer<typeof ModelTelemetry>;
