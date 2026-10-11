'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, messageOf } from './api';

export interface Fetched<T> { data: T | null; error: string | null; loading: boolean; reload: () => Promise<void> }

/** GET a JSON endpoint on mount (and when `url` changes). Pass null to skip. */
export function useFetch<T>(url: string | null): Fetched<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const reload = useCallback(async () => {
    if (!url) return;
    try {
      const d = await api<T>('GET', url);
      if (alive.current) { setData(d); setError(null); }
    } catch (e) {
      if (alive.current) setError(messageOf(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => { setLoading(!!url); void reload(); }, [url, reload]);
  return { data, error, loading, reload };
}
