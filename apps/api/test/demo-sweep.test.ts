import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { demoHeaders } from './demo-session';
import { fakeAi, testContext, validModelEnv } from './helpers';

const params: Record<string, string> = { owner: 'acme', repo: 'api', number: '7', id: 'n1', slug: 'x', deviceId: 'd1' };
const fill = (path: string) => path.replace(/:([A-Za-z]+)(\{[^}]*\})?\??/g, (_m, name: string) => params[name] ?? '1');
const allowedDemoPosts = [/^\/v1\/auth\/logout$/, /^\/v1\/prs\/[^/]+\/[^/]+\/\d+\/(summary|risk|plan|ask)$/];

/** Network-denial sweep: a demo bearer session may touch every route, and none may leave the Worker or spend a model. */
describe('demo session network denial', () => {
  it('reaches no upstream and no model from any /v1 route, and refuses every protected write', async () => {
    const ctx = testContext({ ...validModelEnv() });
    const ai = fakeAi();
    ctx.env.AI = ai as never;
    const app = createApp(ctx.deps);
    const headers = { ...(await demoHeaders(ctx)), 'content-type': 'application/json' };
    const routes = app.routes.filter(r => r.path.startsWith('/v1/') && r.method !== 'ALL' && r.method !== 'OPTIONS');
    expect(routes.length).toBeGreaterThan(30);
    const writes: string[] = [];
    for (const route of routes) {
      const path = fill(route.path);
      const write = !['GET', 'HEAD'].includes(route.method);
      // Auth start/callback/demo/refresh are anonymous endpoints, not demo-session routes.
      if (path.startsWith('/v1/auth/') && path !== '/v1/auth/logout') continue;
      const res = await app.request(path, { method: route.method, headers, ...(write ? { body: '{}' } : {}) }, ctx.env);
      if (write && res.status < 400 && !allowedDemoPosts.some(p => p.test(path))) writes.push(`${route.method} ${path} -> ${res.status}`);
    }
    expect(writes).toEqual([]);
    expect(ctx.net.calls).toEqual([]);
    expect(ai.runs).toHaveLength(0);
  });
});
