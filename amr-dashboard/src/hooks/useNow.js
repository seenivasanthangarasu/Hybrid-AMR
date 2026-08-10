import { useEffect, useState } from 'react';

/**
 * Re-renders the caller on a fixed interval so time-derived UI (e.g. a
 * "stale — 8s" freshness age) keeps counting up without each data hook
 * needing its own ticker. Defaults to 1s.
 */
export default function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
