import { FeatureFlags } from '@mergemate/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { clientIp, limit } from '../middleware/rate-limit';

/** Mounted before session authentication: these switches carry no user data. */
export const flags = new Hono<AppEnv>().get('/flags', async c => {
  await limit(c, { name:'IP_RATE_LIMITER', limiter:c.env.IP_RATE_LIMITER, key:clientIp(c), retryAfter:60 });
  let value: unknown;
  try {
    // KV owns the cross-invocation cache. No mutable per-user/isolate cache.
    const raw=await c.env.POSTS?.get('flags:v1',{cacheTtl:60});
    value=raw && raw.length<=2048 ? JSON.parse(raw) : null;
  } catch { value=null; } // Unavailable/malformed configuration fails closed.
  const record=value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
  const body: FeatureFlags={voice_readout:record.voice_readout===true,voice_notes:record.voice_notes===true};
  return c.json(body,200,{'cache-control':'public, max-age=60'});
});
