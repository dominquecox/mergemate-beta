import { describe, expect, it } from 'vitest';
import { pushPrPath } from '../src/push/links';
describe('native push routing', () => {
  it('resolves the server opaque reference to an internal PR', () => {
    expect(pushPrPath({notificationId:btoa('acme/app#412')})).toBe('/pr/acme/app/412');
  });
  it.each([null, {repo:'../app',number:1}, {repo:'https://evil.test',number:7}, {repo:'acme/app',number:0}, {notificationId:'!bad'}, {repo:'acme/app',number:Infinity}])('rejects malformed targets %j', data => {
    expect(pushPrPath(data)).toBeNull();
  });
});
