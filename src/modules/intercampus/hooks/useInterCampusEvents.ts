import { useCallback, useEffect, useState } from 'react';
import { getInterCampusFests, getVerifiedInterCampusEvents } from '../api/intercampus';
import { InterCampusEvent, InterCampusFestGroup } from '../types/intercampus';

export const useInterCampusEvents = (userId?: string) => {
  const [events, setEvents] = useState<InterCampusEvent[]>([]);
  const [fests, setFests] = useState<InterCampusFestGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getVerifiedInterCampusEvents(userId);
      setEvents(data);
      setFests(getInterCampusFests(data));
    } catch (err: any) {
      setError(err?.message || 'Unable to load InterCampus events');
      setEvents([]);
      setFests([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { events, fests, loading, error, reload };
};
