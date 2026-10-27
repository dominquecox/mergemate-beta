/** Per-client memory only; clearing also invalidates completions already in flight. */
export class RequestCache {
  private generation = 0;
  private pending = new Map<string, Promise<unknown>>();
  private values = new Map<string, {value: unknown; at: number}>();
  clear() { this.generation++; this.pending.clear(); this.values.clear(); }
  invalidate(prefix?: string) { if(!prefix)this.values.clear();else for(const key of this.values.keys())if(key.startsWith(prefix))this.values.delete(key); }
  run<T>(key: string, load: () => Promise<T>, cacheMs = 0): Promise<T> {
    const cached = this.values.get(key);
    if (cached && Date.now() - cached.at < cacheMs) return Promise.resolve(cached.value as T);
    const pending = this.pending.get(key);
    if (pending) return pending as Promise<T>;
    const generation = this.generation;
    const request = Promise.resolve().then(load).then(value => {
      if (generation !== this.generation) throw new Error('Session changed.');
      if (cacheMs) {
        // Bounded memory; no repository data survives sign-out or a new session.
        if (this.values.size >= 100) this.values.delete(this.values.keys().next().value ?? '');
        this.values.set(key, {value, at: Date.now()});
      }
      return value;
    }).finally(() => { if (this.pending.get(key) === request) this.pending.delete(key); });
    this.pending.set(key, request);
    // Serve a recent stale value while one background read revalidates it.
    if (cached && Date.now() - cached.at < cacheMs * 2) {
      void request.catch(() => undefined);
      return Promise.resolve(cached.value as T);
    }
    return request;
  }
}
