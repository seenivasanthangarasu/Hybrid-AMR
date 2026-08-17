import { useEffect, useRef, useState, useCallback } from 'react';
import rosService from '../services/RosService';

export default function useRosTopic({ name, messageType, throttle_rate = 0, staleMs = 3000 }) {
  const [data, setData] = useState(null);
  const [stale, setStale] = useState(true);
  const [hz, setHz] = useState('0.0');

  // Use refs for values that need to be read inside intervals/handlers
  // without causing the effects to restart.
  const lastReceivedAtRef = useRef(null);
  const countRef = useRef(0);
  const startTimeRef = useRef(null); // reset per subscription

  useEffect(() => {
    if (!name || !messageType) return undefined;

    // Reset Hz tracking each time we (re)subscribe
    countRef.current = 0;
    startTimeRef.current = Date.now();
    lastReceivedAtRef.current = null;
    setData(null);
    setStale(true);
    setHz('0.0');

    const topic = rosService.getTopic({ name, messageType, throttle_rate });

    const handler = (msg) => {
      setData(msg);
      const now = Date.now();
      lastReceivedAtRef.current = now;
      setStale(false);

      countRef.current += 1;
      const elapsed = (now - startTimeRef.current) / 1000;
      if (elapsed >= 1.0) {
        setHz((countRef.current / elapsed).toFixed(1));
        countRef.current = 0;
        startTimeRef.current = now;
      }
    };

    topic.subscribe(handler);

    return () => {
      topic.unsubscribe(handler);
    };
  }, [name, messageType, throttle_rate]);

  // Staleness watchdog — reads ref so the interval doesn't need to restart
  // every time a message arrives.
  useEffect(() => {
    const interval = setInterval(() => {
      const last = lastReceivedAtRef.current;
      if (!last) {
        setStale(true);
        setHz('0.0');
        return;
      }
      const isStale = Date.now() - last > staleMs;
      setStale(isStale);
      if (isStale) setHz('0.0');
    }, 1000);

    return () => clearInterval(interval);
  }, [staleMs]); // only restarts when staleMs changes

  return { data, hasData: !!data && !stale, stale, hz };
}
