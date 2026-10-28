import { describe, expect, it } from "vitest";
import { isVerifiedCallbackUrl, nativeLinkPath, validOAuthParams, validGitHubAuthorizeUrl } from "../src/navigation/links";
import { redirectSystemPath } from "../app/+native-intent";
describe("verified native incoming links",()=>{
  const callback="https://app.mergemate.dev/auth/callback?code=abc&state=xyz";
  it("uses the same adapter on cold and warm launches",()=>{
    for(const initial of [true,false]) {
      expect(redirectSystemPath({path:callback,initial})).toBe("/auth/callback?code=abc&state=xyz");
      expect(redirectSystemPath({path:"https://dev.mergemate.dev/pr/acme/api/12",initial})).toBe("/pr/acme/api/12");
    }
  });
  it.each([
    "mergemate://auth/callback?code=abc&state=xyz", "/auth/callback?code=abc&state=xyz",
    "https://evil.example/auth/callback?code=abc&state=xyz", "javascript:alert(1)",
    "https://app.mergemate.dev.evil.example/auth/callback?code=a&state=b",
    "https://user@app.mergemate.dev/auth/callback?code=a&state=b",
    "https://app.mergemate.dev/auth/callback-more?code=a&state=b",
    "https://app.mergemate.dev/auth/callback?code=a&code=b&state=c",
    "https://app.mergemate.dev/auth/callback?code=a&state=b&redirect=javascript:x",
    "https://app.mergemate.dev/auth/callback?code=a&state=b#fragment",
    "https://app.mergemate.dev/pr/acme/api%2fother/1",
    "https://app.mergemate.dev/pr/acme/api/0", "https://app.mergemate.dev/unknown",
  ])("rejects unsafe link %s",raw=>{
    expect(isVerifiedCallbackUrl(raw)).toBe(false); expect(nativeLinkPath(raw)).toBe("/(auth)/sign-in");
  });
  it("rejects duplicate/array callback params rather than picking the first",()=>{
    expect(validOAuthParams({code:["a","b"],state:"s"})).toBe(false);
    expect(validOAuthParams({code:"a",state:"s",error:"denied"})).toBe(false);
    expect(validOAuthParams({code:"a\n",state:"s"})).toBe(false);
    expect(validOAuthParams({error:"access_denied"})).toBe(true);
  });
});

it("opens only GitHub authorization with the expected PKCE and state",()=>{
  const url="https://github.com/login/oauth/authorize?state=s&code_challenge=c&code_challenge_method=S256";
  expect(validGitHubAuthorizeUrl(url,"s","c")).toBe(true);
  for (const candidate of [url.replace("github.com","evil.example"),url+"&state=other",url.replace("S256","plain"),url.replace("challenge=c","challenge=wrong"),"javascript:alert(1)"]) expect(validGitHubAuthorizeUrl(candidate,"s","c")).toBe(false);
});
