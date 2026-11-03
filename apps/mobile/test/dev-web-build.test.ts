import { describe, it, expect } from 'vitest';
import { assertDevWebProxy, assertAccessTokenAllowed } from '../app.config';
import { resolveApiConfig } from '../src/api/config';

describe('dev web release and same-origin CSP', () => {
  it('accepts the proxy in release exports and resolves a real HTTP client, never sample data', () => {
    const env = { EXPO_PUBLIC_API_BASE_URL:'/__api' };
    expect(() => assertDevWebProxy(env,['expo','export','-p','web'])).not.toThrow();
    expect(resolveApiConfig('/__api', true)).toEqual({kind:'http',baseUrl:'/__api'});
  });
  it('rejects the deployed direct-origin mismatch before export', () => {
    for(const argv of [['expo','export','-p','web'],['expo','export','--platform=web']]) {
      expect(() => assertDevWebProxy({EXPO_PUBLIC_API_BASE_URL:'https://api-dev.mergemate.dev'},argv)).toThrow('same-origin CSP');
    }
  });
  it('keeps native dev and production web origins unchanged', () => {
    expect(() => assertDevWebProxy({EXPO_PUBLIC_API_BASE_URL:'https://api-dev.mergemate.dev'},['expo','export','-p','ios','-p','android'])).not.toThrow();
    expect(() => assertDevWebProxy({EXPO_PUBLIC_API_BASE_URL:'https://api.mergemate.dev'},['expo','export','-p','web'])).not.toThrow();
  });
  it('never permits embedding Access service credentials in the proxy web bundle', () => {
    expect(() => assertAccessTokenAllowed({ EXPO_PUBLIC_API_BASE_URL:'/__api',EXPO_PUBLIC_CF_ACCESS_CLIENT_SECRET:'test-only' },['expo','export','-p','web'])).toThrow('native');
  });
});
