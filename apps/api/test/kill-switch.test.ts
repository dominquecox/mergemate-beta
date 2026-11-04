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
  it('treats a missing POSTS binding as blocked', async () => {
    expect(await agentUserBlocked({} as Env, 'u1')).toBe(true);
  });
  it('treats an invalid userId as blocked without reading KV', async () => {
    const env = envWith({ 'agent_blocked:': '', 'agent_blocked:a:b': '' });
    for (const id of ['', 'a:b', 'a/b', 'a b', ' u1', 'u1\n', 'x'.repeat(129)]) {
      expect(await agentUserBlocked(env, id)).toBe(true);
    }
  });
  it('assert fails closed on a KV error and with KV missing', async () => {
    await expect(assertAgentRunAllowed(envWith({ 'agent_runs:v1': 'on' }, true), 'u1')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(assertAgentRunAllowed({} as Env, 'u1')).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('assert rejects a bad userId even when the switch is on', async () => {
    await expect(assertAgentRunAllowed(envWith({ 'agent_runs:v1': 'on' }), 'a:b')).rejects.toMatchObject({
      code: 'forbidden',
      message: 'Agent runs are not available for this account.',
    });
  });
});
