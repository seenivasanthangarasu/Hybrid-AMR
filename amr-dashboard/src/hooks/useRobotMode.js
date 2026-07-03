import { useEffect, useState } from 'react';
import useRosTopic from './useRosTopic.js';

/**
 * useRobotMode
 * Subscribes to /robot_mode (std_msgs/String, expected values "INDOOR" | "OUTDOOR").
 * Per spec: if the topic never publishes, default the dashboard's main
 * view to OUTDOOR — this is a UI-default fallback for view selection
 * only, never presented as a sensor reading.
 */
export default function useRobotMode() {
  const { data, hasData, lastReceivedAt } = useRosTopic({
    name: '/robot_mode',
    messageType: 'std_msgs/String',
    throttle_rate: 200,
    staleMs: 6000,
  });

  const [grace, setGrace] = useState(true);

  // Give the topic a few seconds on startup before falling back, so we
  // don't flash to the default while ROSBridge is still connecting.
  useEffect(() => {
    const t = setTimeout(() => setGrace(false), 3000);
    return () => clearTimeout(t);
  }, []);

  if (hasData && data?.data) {
    const value = String(data.data).toUpperCase();
    if (value === 'INDOOR' || value === 'OUTDOOR') {
      return { mode: value, isTopicLive: true, isDefault: false };
    }
  }

  if (grace && !lastReceivedAt) {
    return { mode: 'OUTDOOR', isTopicLive: false, isDefault: true, pending: true };
  }

  return { mode: 'OUTDOOR', isTopicLive: false, isDefault: true };
}
