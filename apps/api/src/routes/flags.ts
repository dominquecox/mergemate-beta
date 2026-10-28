import { FeatureFlags } from '@mergemate/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../env';

/**
 * Reads the allowlisted boolean flags for server-side gating. Unknown or missing flags
 * are off; an unavailable or malformed document fails closed. Same source as GET /v1/flags.
 */
export const readFeatureFlags = async (env: AppEnv['Bindings']): Promise<FeatureFlags> => {
  let value: unknown;
  try {
    const raw = await env.POSTS?.get('flags:v1', { cacheTtl: 60 });
    value = raw && raw.length <= 2048 ? JSON.parse(raw) : null;
  } catch { value = null; }
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return { voice_readout: record.voice_readout === true, voice_notes: record.voice_notes === true, highlight: record.highlight === true };
};

/** Mounted after session authentication: these switches carry no user data, and the per-IP limit runs in that middleware. */
export const flags = new Hono<AppEnv>().get('/flags', async c => {
  let value: unknown;
  try {
    // KV owns the cross-invocation cache. No mutable per-user/isolate cache.
    const raw=await c.env.POSTS?.get('flags:v1',{cacheTtl:60});
    value=raw && raw.length<=2048 ? JSON.parse(raw) : null;
  } catch { value=null; } // Unavailable/malformed configuration fails closed.
  const record=value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
  const body: FeatureFlags={voice_readout:record.voice_readout===true,voice_notes:record.voice_notes===true,highlight:record.highlight===true};
  return c.json(body,200,{'cache-control':'no-store'});
});
