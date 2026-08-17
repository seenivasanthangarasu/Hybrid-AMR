import { useEffect, useRef, useState } from 'react';
import useRosTopic from './useRosTopic.js';

/**
 * useOdometry
 * Subscribes to /odom (nav_msgs/Odometry).
 * Speed is read directly from twist.twist.linear.x — never estimated.
 * Distance travelled is integrated client-side from successive real
 * pose readings (sum of Euclidean deltas), not simulated.
 */
export default function useOdometry() {
  const { data, hasData } = useRosTopic({
    name: '/odom',
    messageType: 'nav_msgs/Odometry',
    throttle_rate: 100,
  });

  const [distanceTravelled, setDistanceTravelled] = useState(0);
  const lastPos = useRef(null);

  useEffect(() => {
    if (!hasData || !data?.pose?.pose?.position) return;
    const { x, y } = data.pose.pose.position;
    if (lastPos.current) {
      const dx = x - lastPos.current.x;
      const dy = y - lastPos.current.y;
      const delta = Math.sqrt(dx * dx + dy * dy);
      // Ignore noise jumps (e.g. localization resets / TF jumps)
      if (delta < 2) {
        setDistanceTravelled((prev) => prev + delta);
      }
    }
    lastPos.current = { x, y };
  }, [data, hasData]);

  if (!hasData || !data) {
    return {
      hasData: false,
      linearVelocity: null,
      angularVelocity: null,
      heading: null,
      position: null,
      distanceTravelled,
    };
  }

  const linearVelocity = data.twist?.twist?.linear?.x ?? null;
  const angularVelocity = data.twist?.twist?.angular?.z ?? null;
  const orientation = data.pose?.pose?.orientation;
  const heading = orientation ? quaternionToYawDegrees(orientation) : null;

  return {
    hasData: true,
    linearVelocity,
    angularVelocity,
    heading,
    position: data.pose?.pose?.position ?? null,
    orientation,
    distanceTravelled,
  };
}

function quaternionToYawDegrees(q) {
  const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
  const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
  const yawRad = Math.atan2(siny_cosp, cosy_cosp);
  let deg = (yawRad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}
