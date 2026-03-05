import { useEffect, useMemo, useRef } from 'react';
import { supabase } from '../api/supabase';

type UseRealtimeRefreshOptions = {
  tables: string[];
  onChange: () => void | Promise<void>;
  enabled?: boolean;
  debounceMs?: number;
  schema?: string;
};

export function useRealtimeRefresh({
  tables,
  onChange,
  enabled = true,
  debounceMs = 600,
  schema = 'public',
}: UseRealtimeRefreshOptions) {
  const onChangeRef = useRef(onChange);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const normalizedTables = useMemo(
    () => Array.from(new Set(tables.filter(Boolean).map((table) => table.trim()))),
    [tables]
  );
  const tablesKey = useMemo(() => normalizedTables.join(','), [normalizedTables]);

  useEffect(() => {
    if (!enabled || normalizedTables.length === 0) {
      return;
    }

    const channel = supabase.channel(
      `rt:${normalizedTables.join(',')}:${Date.now()}`
    );

    const triggerRefresh = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        Promise.resolve(onChangeRef.current()).catch((error) => {
          console.error('[Realtime] refresh callback failed:', error);
        });
      }, debounceMs);
    };

    normalizedTables.forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema, table },
        triggerRefresh
      );
    });

    channel.subscribe();

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [enabled, debounceMs, schema, tablesKey]);
}
