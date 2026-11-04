import { describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import { ApiError } from '../src/errors';
import { agentRunsEnabled, agentUserBlocked, assertAgentRunAllowed } from '../src/brain/kill-switch';

const envWith = (values: Record<string, string>, fail = false) =>
  ({ POSTS: { get: async (key: string) => { if (fail) throw new Error('kv down'); return values[key] ?? null; } } }) as unknown as Env;

describe('agent kill switch', () => {
  it('is off by default and with no KV binding', async () => {
    expect(await agentRunsEnabled(envWith({}))).toBe(false);
    expect(await agentRunsEnabled({} as Env)).toBe(false);
  });
  it('is on only for exactly "on"', async () => {
    expect(await agentRunsEnabled(envWith({ 'agent_runs:v1': 'on' }))).toBe(true);
    for (const v of ['ON', 'On', 'true', '1', ' on', 'on ', 'on\n', 'off', '']) {
      expect(await agentRunsEnabled(envWith({ 'agent_runs:v1': v }))).toBe(false);
    }
  });
  it('is off when KV throws', async () => {
    expect(await agentRunsEnabled(envWith({ 'agent_runs:v1': 'on' }, true))).toBe(false);
  });
  it('blocks a user whose key has any non-empty value, and only that user', async () => {
    const env = envWith({ 'agent_blocked:u1': '1' });
    expect(await agentUserBlocked(env, 'u1')).toBe(true);
    expect(await agentUserBlocked(env, 'u2')).toBe(false);
    expect(await agentUserBlocked(envWith({ 'agent_blocked:u1': '' }), 'u1')).toBe(false);
  });
  it('treats a KV error on the block check as blocked', async () => {
    expect(await agentUserBlocked(envWith({}, true), 'u1')).toBe(true);
  });
  it('assert passes when on and not blocked', async () => {
    await expect(assertAgentRunAllowed(envWith({ 'agent_runs:v1': 'on' }), 'u1')).resolves.toBeUndefined();
  });
  it('assert throws forbidden with the right message in each case', async () => {
    const off = await assertAgentRunAllowed(envWith({ 'agent_blocked:u1': '1' }), 'u1').catch(e => e);
    expect(off).toBeInstanceOf(ApiError);
    expect(off).toMatchObject({ code: 'forbidden', message: 'Agent runs are turned off.' });
    const blocked = await assertAgentRunAllowed(envWith({ 'agent_runs:v1': 'on', 'agent_blocked:u1': '1' }), 'u1').catch(e => e);
    expect(blocked).toMatchObject({ code: 'forbidden', message: 'Agent runs are not available for this account.' });
  });
  it('treats an empty, over-long or odd user id as blocked instead of looking up a key nobody set', async () => {
    const env = envWith({ 'agent_runs:v1': 'on' });
    for (const id of ['', 'a'.repeat(129), 'u1:x', 'u1/../x', 'u 1', 'u1\n']) expect(await agentUserBlocked(env, id)).toBe(true);
    expect(await agentUserBlocked(env, '0b8f7c2e-6d1a-4c3b-9e5f-1a2b3c4d5e6f')).toBe(false);
    await expect(assertAgentRunAllowed(env, '')).rejects.toMatchObject({ code: 'forbidden' });
  });
});
