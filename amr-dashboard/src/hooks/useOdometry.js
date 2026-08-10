import { useEffect, useRef, useState } from 'react';
import useRosTopic from './useRosTopic.js';

/**
 * useOdometry
 * Subscribes to /odom (nav_msgs/Odometry).
 * Speed is read directly from twist.twist.linear.x — never estimated.
 * Distance travelled is integrated client-side from successive real
 * pose readings (sum of Euclidean deltas), not simulated.
 */
// Max plausible ground speed for this robot class, with headroom. A position
// delta larger than what this speed allows over the elapsed time is treated as
// a localization reset / TF jump, not real motion, and is not accumulated.
const MAX_SPEED_MPS = 3.0;
const JUMP_SLACK_M = 0.5; // fixed tolerance for jitter on top of speed*dt

// Fallback cap when the message carries no usable timestamp — keeps the old
// fixed-distance guard's intent rather than trusting an unbounded delta.
const FALLBACK_MAX_DELTA_M = 2.0;

function stampToSeconds(stamp) {
  if (!stamp) return null;
  const sec = Number(stamp.sec ?? stamp.secs);
  const nsec = Number(stamp.nanosec ?? stamp.nsecs ?? 0);
  if (!Number.isFinite(sec)) return null;
  return sec + (Number.isFinite(nsec) ? nsec / 1e9 : 0);
}

export default function useOdometry() {
  const { data, hasData, stale, lastReceivedAt } = useRosTopic({
    name: '/odom',
    messageType: 'nav_msgs/Odometry',
    throttle_rate: 100,
  });

  const [distanceTravelled, setDistanceTravelled] = useState(0);
  const [lastRejectedJumpAt, setLastRejectedJumpAt] = useState(null);
  const lastPos = useRef(null);
  const lastStamp = useRef(null);

  useEffect(() => {
    if (!hasData || !data?.pose?.pose?.position) return;
    const { x, y } = data.pose.pose.position;
    const stampSec = stampToSeconds(data.header?.stamp);

    if (lastPos.current) {
      const dx = x - lastPos.current.x;
      const dy = y - lastPos.current.y;
      const delta = Math.sqrt(dx * dx + dy * dy);

      // Time-aware jump rejection (spec REQ-07): allow whatever distance the
      // robot could physically cover since the last fix, instead of a fixed 2m
      // cutoff that silently dropped legitimate motion after a delivery gap.
      const dt = stampSec != null && lastStamp.current != null ? stampSec - lastStamp.current : null;
      const maxDelta = dt != null && dt > 0 ? MAX_SPEED_MPS * dt + JUMP_SLACK_M : FALLBACK_MAX_DELTA_M;

      if (delta <= maxDelta) {
        setDistanceTravelled((prev) => prev + delta);
      } else {
        // Surface the rejection rather than dropping it silently.
        setLastRejectedJumpAt(new Date());
      }
    }
    lastPos.current = { x, y };
    if (stampSec != null) lastStamp.current = stampSec;
  }, [data, hasData]);

  // Freshness signals for consumers (spec REQ-17). `data` persists in
  // useRosTopic even after it goes stale, so we surface the last-known
  // values regardless of staleness; `hasData` remains live-only and
  // `hasEverData` distinguishes "went quiet" from "never connected".
  const timing = { hasData, hasEverData: !!data, stale, lastReceivedAt };

  if (!data) {
    return {
      ...timing,
      linearVelocity: null,
      angularVelocity: null,
      heading: null,
      position: null,
      distanceTravelled,
      lastRejectedJumpAt,
    };
  }

  const linearVelocity = data.twist?.twist?.linear?.x ?? null;
  const angularVelocity = data.twist?.twist?.angular?.z ?? null;
  const orientation = data.pose?.pose?.orientation;
  const heading = orientation ? quaternionToYawDegrees(orientation) : null;

  return {
    ...timing,
    linearVelocity,
    angularVelocity,
    heading,
    position: data.pose?.pose?.position ?? null,
    orientation,
    distanceTravelled,
    lastRejectedJumpAt,
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
