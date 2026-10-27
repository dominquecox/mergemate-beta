import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '../api/errors';

type Page<T> = {items: T[]; nextCursor: string | null};
/** One page in flight, stale responses discarded when the filter or session changes. */
export function usePagedList<T extends {id: string}>(key: string, load: (cursor?: string | null) => Promise<Page<T>>) {
  const loader = useRef(load); loader.current = load;
  const generation = useRef(0);
  const pending = useRef(false);
  const lastRefresh = useRef(0);
  const cursor = useRef<string | null>(null);
  const [items,setItems] = useState<T[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string | null>(null);
  const [hasMore,setHasMore] = useState(false);
  const fetchPage = useCallback(async (reset: boolean) => {
    if (pending.current || (!reset && !cursor.current)) return;
    if (reset && Date.now()-lastRefresh.current < 3000) return;
    if (reset) lastRefresh.current = Date.now();
    pending.current = true; setBusy(true); setError(null);
    const version = generation.current;
    try {
      const page = await loader.current(reset ? null : cursor.current);
      if (version !== generation.current) return;
      cursor.current = page.nextCursor; setHasMore(!!page.nextCursor);
      setItems(prev => [...new Map((reset ? page.items : [...prev,...page.items]).map(item => [item.id,item])).values()]);
    } catch (e) {
      if (version === generation.current) setError(toUserMessage(e,'Could not load this page. Try again.'));
    } finally {
      if (version === generation.current) { pending.current = false; setBusy(false); setLoading(false); }
    }
  },[]);
  useEffect(() => {
    generation.current++; pending.current = false; lastRefresh.current = 0; cursor.current = null;
    setItems([]); setLoading(true); setHasMore(false);
    void fetchPage(true);
    return () => { generation.current++; };
  },[key,fetchPage]);
  return {items,setItems,loading,busy,error,setError,hasMore,refresh:()=>fetchPage(true),more:()=>fetchPage(false)};
}
