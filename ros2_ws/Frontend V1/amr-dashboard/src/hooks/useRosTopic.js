import { useEffect, useRef, useState } from 'react';
import rosService from '../services/RosConnectionService.js';

/**
 * useRosTopic
 * Generic live subscription to a single ROS2 topic via ROSBridge.
 * Returns the most recent message, a `hasData` flag, and the timestamp
 * of last receipt so stale topics can be flagged as NO DATA.
 *
 * No fallback values are ever synthesized here — if nothing has been
 * received, `data` stays null and consumers must render NO DATA.
 */
export default function useRosTopic({ name, messageType, throttle_rate = 100, staleMs = 4000 }) {
  const [data, setData] = useState(null);
  const [lastReceivedAt, setLastReceivedAt] = useState(null);
  const [stale, setStale] = useState(true);
  const topicRef = useRef(null);

  useEffect(() => {
    if (!name || !messageType) return undefined;

    const topic = rosService.getTopic({ name, messageType, throttle_rate });
    topicRef.current = topic;

    const handler = (msg) => {
      setData(msg);
      setLastReceivedAt(Date.now());
      setStale(false);
    };

    topic.subscribe(handler);

    return () => {
      topic.unsubscribe(handler);
    };
  }, [name, messageType, throttle_rate]);

  // Staleness watchdog — if no message has arrived recently, surface NO DATA
  useEffect(() => {
    const interval = setInterval(() => {
      if (!lastReceivedAt) {
        setStale(true);
        return;
      }
      setStale(Date.now() - lastReceivedAt > staleMs);
    }, 1000);
    return () => clearInterval(interval);
  }, [lastReceivedAt, staleMs]);

  return { data, hasData: !!data && !stale, stale, lastReceivedAt };
}
