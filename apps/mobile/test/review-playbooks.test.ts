import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PLAYBOOK_TEMPLATES, parsePlaybook, parseReviewPr } from '../src/workflows/model';
import { requiresSession, resolveShell } from '../src/layout/breakpoints';

const local = vi.hoisted(() => new Map<string, string>());
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => local.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { local.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { local.delete(key); }),
}));
import * as SecureStore from 'expo-secure-store';
import { StorageService } from '../src/storage';

describe('review playbooks', () => {
  beforeEach(() => { local.clear(); vi.clearAllMocks(); StorageService.setRecentSearchAccount('alice'); });
  it('validates every template and rejects corrupt, duplicate and unbounded steps', () => {
    for (const template of PLAYBOOK_TEMPLATES) expect(parsePlaybook(template)?.steps).toEqual(template.steps);
    for (const value of [null, {}, { title: '', steps: ['context','read'] }, { title: 'x'.repeat(49), steps: ['context','read'] }, { title:'x',steps:['context'] }, { title:'x',steps:['context','context'] }, { title:'x',steps:['context','merge'] }]) expect(parsePlaybook(value)).toBeNull();
  });
  it('accepts direct GitHub PR links and never opens arbitrary destinations', () => {
    expect(parseReviewPr('https://github.com/owner/repo/pull/123')).toEqual({ owner:'owner',repo:'repo',number:'123' });
    for (const url of ['javascript:alert(1)','https://evil.test/o/r/pull/1','http://github.com/o/r/pull/1','https://github.com@evil.test/o/r/pull/1','https://user:pass@github.com/o/r/pull/1','https://github.com/o/r/pull/1?q=token','https://github.com/o/r/pull/1#test','https://github.com/o/r/pull/0','https://github.com/o/r/pull/1000000000']) expect(parseReviewPr(url)).toBeNull();
  });
  it('requires a session and gets a desktop shell for the playbook route', () => {
    expect(requiresSession(['workflows'])).toBe(true);
    expect(resolveShell({ width:1440, segments:['workflows'],signedIn:true,isWeb:true }).sidebar).toBe(true);
  });
  it('round-trips the local preference for its account without leaking to another', async () => {
    await StorageService.setReviewPlaybook('alice',PLAYBOOK_TEMPLATES[0]);
    expect(await StorageService.getReviewPlaybook('alice')).toMatchObject({ title:'Everyday review' });
    expect(await StorageService.getReviewPlaybook('bob')).toBeNull();
    StorageService.setRecentSearchAccount('bob');
    await expect(StorageService.setReviewPlaybook('alice',PLAYBOOK_TEMPLATES[1])).rejects.toThrow('account changed');
    await StorageService.clearAccountData();
    expect(await StorageService.getReviewPlaybook('alice')).toBeNull();
  });
  it('does not report success for failed or oversized writes, or unreadable data', async () => {
    await expect(StorageService.setReviewPlaybook('alice','x'.repeat(2000))).rejects.toThrow();
    vi.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('locked'));
    await expect(StorageService.setReviewPlaybook('alice',PLAYBOOK_TEMPLATES[0])).rejects.toThrow();
    local.set('mergemate_review_playbook','not json');
    await expect(StorageService.getReviewPlaybook('alice')).rejects.toThrow('load');
  });
  it('serializes saves and waits for them before account cleanup', async () => {
    let release!:()=>void;
    vi.mocked(SecureStore.setItemAsync).mockImplementationOnce(async(key,value)=>{ await new Promise<void>(resolve=>{release=resolve;}); local.set(key,value); });
    const save = StorageService.setReviewPlaybook('alice',PLAYBOOK_TEMPLATES[0]);
    await Promise.resolve();
    const clear = StorageService.clearAccountData();
    release(); await save; await clear;
    expect(await StorageService.getReviewPlaybook('alice')).toBeNull();
  });
});
