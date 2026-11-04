import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { ApiError } from '../src/errors';
import { brainEnabled } from '../src/brain/flag';
import { createHttpBrainApi } from '../src/brain/runtime/http';
import { buildProceedPrompt, GUARDRAILS } from '../src/brain/runtime/prompt';
import { parseProposal, validateProposal } from '../src/brain/runtime/proposal';
import { runBrainCard } from '../src/brain/runtime/run';
import * as runtime from '../src/brain/runtime';
import { createGatedModel } from '../src/brain/runtime/model';
import { fakeAi, testContext, validModelEnv } from './helpers';
import { signIn } from './sign-in';
import type { ProceedWithTrackResponse, WorkProposal } from '../src/brain/runtime/types';

const env = (raw: string | null): Env =>
  ({ POSTS: { get: async () => raw } }) as unknown as Env;

const context = (rules = 'Follow the repo rules.'): ProceedWithTrackResponse => ({
  card: {
    id: 'card-1', projectId: 'o/r', position: 1, title: 'Fix the label', details: 'Label is wrong.',
    priority: 'P1', status: 'active', doneWhen: 'Label reads correctly.', updatedAt: '2026-11-04T14:00:00Z',
  },
  lock: { cardId: 'card-1', agent: 'muse', tool: 'muse', since: '2026-11-04T14:00:00Z', expiresAt: '2026-11-04T15:00:00Z' },
  rules,
  boardTop: [],
  trackTail: [],
});

const proposal = (overrides: Partial<WorkProposal> = {}): WorkProposal => ({
  summary: 'Fix the label text',
  changes: [{ path: 'apps/mobile/src/brain/notes.ts', content: 'export const x = 1;\n' }],
  noChange: false,
  note: 'Small fix.',
  ...overrides,
});

describe('brain flag gate', () => {
  it('is on only for an explicit true', async () => {
    expect(await brainEnabled(env(JSON.stringify({ brain: true })))).toBe(true);
    for (const raw of [null, '{}', '{"brain":false}', '{"brain":"true"}', '{"brain":1}', 'not-json', 'x'.repeat(2049)]) {
      expect(await brainEnabled(env(raw))).toBe(false);
    }
    expect(await brainEnabled({} as Env)).toBe(false);
    expect(
      await brainEnabled({ POSTS: { get: async () => { throw new Error('down'); } } } as unknown as Env),
    ).toBe(false);
  });
});

describe('proceed prompt', () => {
  it('embeds the card, verbatim rules and guardrails', () => {
    const { system, prompt } = buildProceedPrompt(context('Ship behind flag.'));
    expect(system).toContain('JSON object only');
    expect(prompt).toContain('Fix the label');
    expect(prompt).toContain('Ship behind flag.');
    expect(prompt).toContain(GUARDRAILS.split('\n')[0] as string);
    expect(prompt).toContain('Never merge');
  });

  it('truncates overlong rules instead of dropping them', () => {
    const { prompt } = buildProceedPrompt(context('r'.repeat(25_000)));
    expect(prompt).toContain('…[truncated]');
    expect(prompt.length).toBeLessThan(60_000);
  });
});

describe('proposal validation', () => {
  it('accepts a bounded patch and a no-change outcome', () => {
    expect(validateProposal(proposal()).changes).toHaveLength(1);
    expect(validateProposal(proposal({ noChange: true, changes: [] })).noChange).toBe(true);
  });

  it('rejects malformed, mistargeted or secret-shaped proposals', () => {
    expect(() => parseProposal('not json')).toThrow(ApiError);
    expect(() => validateProposal(proposal({ noChange: true }))).toThrow(/must not list files/);
    expect(() => validateProposal(proposal({ changes: [{ path: '../escape.ts', content: 'x' }] }))).toThrow(/boundary/);
    expect(() => validateProposal(proposal({ changes: [{ path: 'apps/api/src/secret.ts', content: 'x' }] }))).toThrow(
      /boundary/,
    );
    expect(() =>
      validateProposal(proposal({ changes: [{ path: 'apps/mobile/src/brain/a.ts', content: 'const k = "ghp_abcdefghij1234567890";' }] })),
    ).toThrow(/secret-shaped/);
    // Stripe live and restricted keys use underscores.
    for (const key of ['sk_live_' + 'a'.repeat(24), 'rk_live_' + 'a'.repeat(24)]) {
      expect(() => validateProposal(proposal({ changes: [{ path: 'apps/mobile/src/brain/a.ts', content: `const k = "${key}";` }] }))).toThrow(/secret-shaped/);
    }
  });
});

describe('runBrainCard', () => {
  const planText = (p: WorkProposal): string => JSON.stringify(p);

  it('refuses to run while the flag is off and calls nothing', async () => {
    const api = { proceedWithTrack: vi.fn(), writeHandoff: vi.fn() };
    const model = { complete: vi.fn() };
    await expect(
      runBrainCard({ env: env('{}'), api, model, projectId: 'o/r', agent: 'muse' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(api.proceedWithTrack).not.toHaveBeenCalled();
    expect(model.complete).not.toHaveBeenCalled();
  });

  it('proceeds, plans through the model and writes the handoff', async () => {
    const api = {
      proceedWithTrack: vi.fn(async () => context()),
      writeHandoff: vi.fn(async (handoff: { projectId: string; cardId: string; agent: string; stoppedAt: string; next: string }) => {
        void handoff;
        return { at: '2026-11-04T14:10:00Z' };
      }),
    };
    const model = { complete: vi.fn(async () => ({ text: planText(proposal()) })) };
    const outcome = await runBrainCard({
      env: env(JSON.stringify({ brain: true })), api, model, projectId: 'o/r', agent: 'muse',
    });
    // Identity comes from the token server-side: only the project id is sent.
    expect(api.proceedWithTrack).toHaveBeenCalledWith('o/r');
    expect(model.complete).toHaveBeenCalledOnce();
    expect(outcome.patchHash).toMatch(/^[a-f\d]{64}$/);
    expect(api.writeHandoff).toHaveBeenCalledOnce();
    expect(api.writeHandoff.mock.calls[0]?.[0]).toMatchObject({ projectId: 'o/r', cardId: 'card-1' });
    expect(String(api.writeHandoff.mock.calls[0]?.[0]?.next)).toContain('passkey approval');
    expect(outcome.handoffAt).toBe('2026-11-04T14:10:00Z');
  });

  it('rejects an invalid plan before any handoff', async () => {
    const api = { proceedWithTrack: vi.fn(async () => context()), writeHandoff: vi.fn(async () => ({ at: '' })) };
    const model = { complete: vi.fn(async () => ({ text: '{"nope":true}' })) };
    await expect(
      runBrainCard({ env: env(JSON.stringify({ brain: true })), api, model, projectId: 'o/r', agent: 'muse' }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(api.writeHandoff).not.toHaveBeenCalled();
  });
});

describe('http brain api', () => {
  const proceedResponse = {
    card: {
      id: 'card-1', projectId: 'o/r', position: 0, title: 'Fix the label', details: 'Label is wrong.',
      priority: 'P1', status: 'open', doneWhen: 'Label reads correctly.', updatedAt: '2026-11-04T14:00:00Z',
    },
    lock: { cardId: 'card-1', agent: 'muse', tool: 'muse', since: '2026-11-04T14:00:00Z', expiresAt: '2026-11-04T15:00:00Z' },
    rules: 'Follow the repo rules.',
    boardTop: [],
    trackTail: [],
  };
  const stubFetch = (handler: (url: string, init: RequestInit) => Response): typeof fetch =>
    (async (input: string | URL | Request, init?: RequestInit) => handler(String(input), init ?? {})) as typeof fetch;
  const json = (value: unknown, status = 200): Response =>
    new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

  it('sends only the project id and parses the proceed response', async () => {
    const seen: Array<{ url: string; auth: string | null; body: unknown }> = [];
    const api = createHttpBrainApi({
      baseUrl: 'https://api.example.test/agent/v1/brain/',
      token: 'tok',
      fetchImpl: stubFetch((url, init) => {
        seen.push({ url, auth: new Headers(init.headers).get('authorization'), body: JSON.parse(String(init.body)) });
        return json(proceedResponse);
      }),
    });
    const response = await api.proceedWithTrack('o/r');
    expect(response.card.id).toBe('card-1');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe('https://api.example.test/agent/v1/brain/proceed');
    expect(seen[0]?.auth).toBe('Bearer tok');
    expect(seen[0]?.body).toEqual({ projectId: 'o/r' });
  });

  it('sends the project id on handoff and refuses to log the token', async () => {
    const bodies: unknown[] = [];
    const api = createHttpBrainApi({
      baseUrl: 'https://api.example.test/agent/v1/brain',
      token: 'tok',
      fetchImpl: stubFetch((_url, init) => {
        bodies.push(JSON.parse(String(init.body)));
        return json({ handedOff: true });
      }),
    });
    const { at } = await api.writeHandoff({
      projectId: 'o/r', cardId: 'card-1', agent: 'muse', stoppedAt: 'done', next: 'review',
    });
    expect(typeof at).toBe('string');
    expect(bodies[0]).toMatchObject({ projectId: 'o/r', cardId: 'card-1' });
    await expect(
      api.writeHandoff({ projectId: '', cardId: 'card-1', agent: 'muse', stoppedAt: 'done', next: 'review' }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('maps auth failures and bad payloads to API errors', async () => {
    const forbidden = createHttpBrainApi({
      baseUrl: 'https://api.example.test/agent/v1/brain', token: 'bad',
      fetchImpl: stubFetch(() => new Response('no', { status: 401 })),
    });
    await expect(forbidden.proceedWithTrack('o/r')).rejects.toMatchObject({ code: 'forbidden' });
    const broken = createHttpBrainApi({
      baseUrl: 'https://api.example.test/agent/v1/brain', token: 'tok',
      fetchImpl: stubFetch(() => json({ nope: true })),
    });
    await expect(broken.proceedWithTrack('o/r')).rejects.toMatchObject({ code: 'upstream_unavailable' });
    const down = createHttpBrainApi({
      baseUrl: 'https://api.example.test/agent/v1/brain', token: 'tok',
      fetchImpl: stubFetch(() => { throw new Error('down'); }),
    });
    await expect(down.proceedWithTrack('o/r')).rejects.toMatchObject({ code: 'upstream_unavailable' });
  });
});

describe('publication path', () => {
  it('has no publish or caller-built approval entry point', () => {
    // A draft PR only comes from the workflow executor after its own stored passkey approval.
    expect(Object.keys(runtime)).not.toEqual(expect.arrayContaining(['openDraftPr']));
    expect(Object.keys(runtime).some((name) => /publish|approv|merge/i.test(name))).toBe(false);
  });
});

describe('gated model', () => {
  const setup = async () => {
    const ctx = testContext(validModelEnv());
    const ai = fakeAi(async () => ({ response: JSON.stringify({ summary: 's', changes: [], noChange: true, note: 'n' }) }));
    ctx.env.AI = ai;
    const session = await signIn(ctx);
    const record = { userId: session.userId } as unknown as Parameters<typeof createGatedModel>[2];
    return { ctx, ai, session, record };
  };

  it('refuses without AI consent and never calls the model', async () => {
    const { ctx, ai, record } = await setup();
    await expect(createGatedModel(ctx.env, ctx.deps, record).complete({ system: 's', prompt: 'p', maxOutputTokens: 10 })).rejects.toMatchObject({ code: 'consent_required' });
    expect(ai.runs).toHaveLength(0);
  });

  it('counts one action against the user and redacts secrets from the prompt', async () => {
    const { ctx, ai, session, record } = await setup();
    await ctx.db.prepare('INSERT INTO consent_grants(user_id,granted,version,at) VALUES(?,1,?,?)').bind(session.userId, '2', ctx.time.now().toISOString()).run();
    const result = await createGatedModel(ctx.env, ctx.deps, record).complete({ system: 's', prompt: 'token ghp_abcdefghij1234567890abcdef', maxOutputTokens: 10 });
    expect(result.text).toContain('noChange');
    expect(ai.runs).toHaveLength(1);
    expect(JSON.stringify(ai.runs[0]?.inputs)).not.toContain('ghp_abcdefghij1234567890abcdef');
    const used = ctx.db.rows<{ scope: string; used: number }>('SELECT scope,used FROM ai_usage_daily');
    expect(used.find((row) => row.scope.includes(session.userId))?.used).toBe(1);
  });

  it('gives the action back when the model answer is unusable', async () => {
    const { ctx, ai, session, record } = await setup();
    ai.run = async () => ({ response: 'not json' });
    await ctx.db.prepare('INSERT INTO consent_grants(user_id,granted,version,at) VALUES(?,1,?,?)').bind(session.userId, '2', ctx.time.now().toISOString()).run();
    await expect(createGatedModel(ctx.env, ctx.deps, record).complete({ system: 's', prompt: 'p', maxOutputTokens: 10 })).rejects.toMatchObject({ code: 'upstream_unavailable' });
    const used = ctx.db.rows<{ scope: string; used: number }>('SELECT scope,used FROM ai_usage_daily');
    expect(used.find((row) => row.scope.includes(session.userId))?.used ?? 0).toBe(0);
  });
});
