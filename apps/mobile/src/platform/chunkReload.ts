import { Platform } from 'react-native';

const KEY = 'mergemate.chunkReloadAt';
const WINDOW_MS = 60_000;

/** A tab left open across a deploy asks for code chunks that no longer exist. */
export function isChunkLoadError(message: string): boolean {
  return /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

const reloadOnce = () => {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    // Reload at most once a minute, so a real outage can never loop.
    if (Date.now() - last < WINDOW_MS) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
};

/** Web only: reload once when an app code chunk fails to load after a deploy. Returns a cleanup. */
export function installChunkReloadGuard(): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => {};
  const onError = (event: Event) => {
    const target = event.target as HTMLScriptElement | null;
    if (target && target.tagName === 'SCRIPT' && /\/_expo\/static\/js\//.test(target.src ?? '')) reloadOnce();
    else if (event instanceof ErrorEvent && isChunkLoadError(event.message ?? '')) reloadOnce();
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason as { message?: unknown; name?: unknown } | undefined;
    if (isChunkLoadError(`${String(reason?.name ?? '')} ${String(reason?.message ?? reason ?? '')}`)) reloadOnce();
  };
  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejection);
  return () => { window.removeEventListener('error', onError, true); window.removeEventListener('unhandledrejection', onRejection); };
}
