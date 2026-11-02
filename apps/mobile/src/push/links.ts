/** Push data is untrusted. Only an internal PR path can be opened, never a supplied URL. */
export function pushPrPath(data: unknown): `/pr/${string}/${string}/${number}` | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as { notificationId?: unknown; repo?: unknown; number?: unknown };
  let repo = value.repo, number = value.number;
  if (typeof value.notificationId === 'string' && value.notificationId.length <= 400) {
    try {
      const text = atob(value.notificationId.replace(/-/g, '+').replace(/_/g, '/'));
      const match = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#([1-9]\d*)$/.exec(text);
      if (match) { repo = match[1]; number = Number(match[2]); }
    } catch { return null; }
  }
  if (typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)
    || repo.split('/').some(p => /^\.+$/.test(p)) || typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1) return null;
  const [owner='',name=''] = repo.split('/');
  return `/pr/${owner}/${name}/${number}`;
}
