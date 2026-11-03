/** Route same-origin dev proxy requests through legacy API fixture handlers; never performs network I/O. */
export function fixtureApiUrl(input, base) {
  const url = new URL(input);
  if (url.origin === new URL(base).origin && /^\/__api\/v1(?:\/|$)/.test(url.pathname)) {
    return new URL(url.pathname.slice('/__api'.length) + url.search, 'https://api-dev.mergemate.dev');
  }
  return url;
}
