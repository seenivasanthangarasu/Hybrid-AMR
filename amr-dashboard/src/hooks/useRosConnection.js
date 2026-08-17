import { useEffect, useState } from 'react';
import rosService from '../services/RosConnectionService.js';

/**
 * useRosConnection
 * Connects to ROSBridge on mount and exposes live connection status.
 * Status values: 'disconnected' | 'connecting' | 'connected' | 'error' | 'closed'
 *
 * `retry` mirrors the service's bounded auto-reconnect state
 * ({ attempt, maxAttempts, nextAttemptAt, exhausted }) so the header can show
 * that a recovery is already in progress rather than leaving the operator to
 * guess whether pressing RECONNECT is required.
 */
export default function useRosConnection() {
  const [state, setState] = useState(() => rosService.getState());

  useEffect(() => {
    rosService.connect();
    return rosService.onStatusChange((_status, next) => setState(next));
  }, []);

  const reconnect = () => rosService.reconnect();

  return {
    status: state.status,
    isConnected: state.status === 'connected',
    retry: state.retry,
    epoch: state.epoch,
    reconnect,
  };
}

/**
 * Subscription-rebuild signal. Hooks that capture `rosService.ros` (or a cached
 * ROSLIB.Topic) at mount time must re-run their effect when the underlying
 * connection is replaced — an auto-reconnect builds a *new* ROSLIB.Ros, and a
 * subscription bound to the old one is dead. Keyed on this, panels come back on
 * their own after a link drop instead of sitting silent under a LINKED header.
 */
export function useConnectionEpoch() {
  const [epoch, setEpoch] = useState(() => rosService.epoch);

  useEffect(() => rosService.onStatusChange((_status, next) => setEpoch(next.epoch)), []);

  return epoch;
}
